/**
 * KeyManager - 多 API key 负载均衡管理器
 *
 * 职责：
 * 1. 从环境变量加载多个 Tavily API key
 * 2. 通过 /usage 端点查询各 key 剩余额度
 * 3. 按剩余额度优先策略分配 key 到每次请求
 * 4. 根据 API 错误码更新 key 状态（冷却/移除/限流）
 * 5. 定时刷新 key 额度（5 分钟间隔）
 */

import axios, { AxiosError } from "axios";

// ============ 类型定义 ============

/** Key 状态枚举 */
export enum KeyStatus {
  ACTIVE = "active",
  QUOTA_EXHAUSTED = "quota_exhausted",
  INVALID = "invalid",
  RATE_LIMITED = "rate_limited",
}

/** 单个 key 的状态信息 */
export interface KeyInfo {
  key: string;
  status: KeyStatus;
  remaining: number | null; // 剩余额度（null = 未知）
  limit: number | null; // 月度限额（null = 不限）
  lastQueryAt: number; // 上次查询 /usage 的时间戳
  cooldownUntil: number; // 冷却到期时间戳（0 = 未冷却）
}

/** /usage 端点响应类型 */
interface UsageResponse {
  key?: {
    usage?: number;
    limit?: number | null;
  };
}

/** key 脱敏：只显示前 8 位 + *** */
export function sanitizeKey(key: string): string {
  if (!key) return "<empty>";
  if (key.length <= 8) return key.substring(0, 4) + "***";
  return key.substring(0, 8) + "***";
}

// ============ KeyManager 类 ============

export class KeyManager {
  private keyMap: Map<string, KeyInfo> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private usageUrl = "https://api.tavily.com/usage";
  private refreshing = false;

  /** 刷新间隔：5 分钟（/usage 限流 10 次/10 分钟，3 key 查一轮需 3 次，5 分钟安全） */
  private static readonly REFRESH_INTERVAL_MS = 5 * 60 * 1000;

  /** 冷却时间：1 小时（满额 key 在下次定时刷新前不重新尝试） */
  private static readonly COOLDOWN_MS = 60 * 60 * 1000;

  constructor() {
    // 构造时即加载 key 列表并初始化 keyMap
    const keys = this.loadKeys();
    for (const key of keys) {
      this.keyMap.set(key, {
        key,
        status: KeyStatus.ACTIVE,
        remaining: null,
        limit: null,
        lastQueryAt: 0,
        cooldownUntil: 0,
      });
    }
  }

  /**
   * 从环境变量加载 key 列表
   * 优先级：TAVILY_API_KEYS > TAVILY_API_KEY_* > TAVILY_API_KEY
   */
  private loadKeys(): string[] {
    const keysSet = new Set<string>();

    // 方式 1：TAVILY_API_KEYS（逗号分隔）
    const keysEnv = process.env.TAVILY_API_KEYS;
    if (keysEnv) {
      const keys = keysEnv.split(",").map((k) => k.trim()).filter(Boolean);
      for (const k of keys) {
        keysSet.add(k);
      }
      console.error(`[KeyManager] 从 TAVILY_API_KEYS 加载了 ${keys.length} 个 key`);
    }

    // 方式 2：扫描 TAVILY_API_KEY_* 后缀
    for (const envKey of Object.keys(process.env)) {
      if (envKey.startsWith("TAVILY_API_KEY_") && envKey !== "TAVILY_API_KEYS") {
        const value = process.env[envKey];
        if (value && typeof value === "string" && value.trim()) {
          keysSet.add(value.trim());
        }
      }
    }
    const suffixCount = keysSet.size;

    // 方式 3：单 key 向后兼容
    const singleKey = process.env.TAVILY_API_KEY;
    if (singleKey && typeof singleKey === "string" && singleKey.trim()) {
      keysSet.add(singleKey.trim());
    }

    const keys = Array.from(keysSet);
    if (keys.length === 0) {
      throw new Error(
        "[KeyManager] 未找到任何有效的 Tavily API key。" +
        "请设置 TAVILY_API_KEYS（逗号分隔）、TAVILY_API_KEY_<后缀> 或 TAVILY_API_KEY 环境变量。"
      );
    }

    console.error(
      `[KeyManager] 共加载 ${keys.length} 个 key` +
      (suffixCount > 0 ? `（含 ${suffixCount} 个来自 TAVILY_API_KEY_*）` : "") +
      `: ${keys.map(sanitizeKey).join(", ")}`
    );

    return keys;
  }

  /**
   * 初始化 key 池：查询各 key 的 /usage 额度
   */
  async initialize(): Promise<void> {
    const keys = Array.from(this.keyMap.keys());
    if (keys.length === 0) return;

    // 启动时主动探查剩余额度（顺序调用，避免同时触发限流）
    console.error("[KeyManager] 开始探查各 key 剩余额度...");
    for (const key of keys) {
      await this.fetchAndUpdateUsage(key);
    }
    console.error("[KeyManager] 启动探查完成，key 状态：");
    this.logKeyStatus();

    // 启动定时刷新
    this.startPeriodicRefresh();
  }

  /**
   * 查询单个 key 的 /usage 并更新状态
   * 查询失败时降级为 unknow（不改变 key 状态，保持 ACTIVE 但 remaining=null）
   */
  async fetchAndUpdateUsage(key: string): Promise<void> {
    const info = this.keyMap.get(key);
    if (!info) return;

    // 如果 key 已被标记为 invalid，跳过
    if (info.status === KeyStatus.INVALID) return;

    try {
      const response = await axios.get<UsageResponse>(this.usageUrl, {
        headers: {
          Authorization: `Bearer ${key}`,
          accept: "application/json",
        },
        timeout: 10000,
      });

      const usageData = response.data;
      const usage = usageData.key?.usage ?? 0;
      const limit = usageData.key?.limit ?? null;

      info.remaining = limit !== null ? Math.max(0, limit - usage) : null;
      info.limit = limit;
      info.lastQueryAt = Date.now();

      // 如果之前是 quota_exhausted，检查是否已恢复
      if (info.status === KeyStatus.QUOTA_EXHAUSTED) {
        if (limit !== null && usage < limit) {
          info.status = KeyStatus.ACTIVE;
          info.cooldownUntil = 0;
          console.error(
            `[KeyManager] ${sanitizeKey(key)} 额度已恢复 ` +
            `(usage=${usage}/${limit}), 重新激活`
          );
        }
      }

      // 如果 usage >= limit，标记为满额
      if (limit !== null && usage >= limit && info.status === KeyStatus.ACTIVE) {
        info.status = KeyStatus.QUOTA_EXHAUSTED;
        info.cooldownUntil = Date.now() + KeyManager.COOLDOWN_MS;
        console.error(
          `[KeyManager] ${sanitizeKey(key)} 额度已满 ` +
          `(usage=${usage}/${limit}), 冷却至定时刷新`
        );
      }

      const remainingStr =
        info.remaining !== null ? `${info.remaining}` : "unlimited";
      console.error(
        `[KeyManager] ${sanitizeKey(key)}: usage=${usage}, ` +
        `limit=${limit ?? "unlimited"}, remaining=${remainingStr}, ` +
        `status=${info.status}`
      );
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;

      if (statusCode === 401) {
        // /usage 返回 401 → key 无效
        info.status = KeyStatus.INVALID;
        console.error(
          `[KeyManager] ${sanitizeKey(key)} /usage 返回 401, 标记为无效并移除`
        );
      } else {
        // 其他错误（网络、限流等）→ 降级为 unknown
        console.error(
          `[KeyManager] ${sanitizeKey(key)} /usage 查询失败 ` +
          `(status=${statusCode}, ${(error as Error).message}), ` +
          `降级为 unknown，按轮询兜底`
        );
        // 保持 ACTIVE 但 remaining=null，靠轮询兜底
      }
    }
  }

  /**
   * 选择最佳 key：从 active 池中选 remaining 最大的
   * 策略：
   * 1. 优先选 remaining 最大的 active key
   * 2. 若有 remaining 未知（null）的 key，优先选它探查
   * 3. 若所有 key 剩余额度相等，随机打散
   * 4. 无可用 key 时返回 null
   */
  selectKey(): string | null {
    const now = Date.now();

    // 收集所有可用 key
    const activeKeys: KeyInfo[] = [];
    for (const info of this.keyMap.values()) {
      // 检查冷却状态
      if (info.status === KeyStatus.QUOTA_EXHAUSTED) {
        if (info.cooldownUntil > 0 && now < info.cooldownUntil) {
          continue; // 仍在冷却中
        }
        // 冷却到期，自动恢复为 active（等定时刷新更新额度）
        info.status = KeyStatus.ACTIVE;
        info.cooldownUntil = 0;
        console.error(
          `[KeyManager] ${sanitizeKey(info.key)} 冷却到期，恢复为 active`
        );
      }

      if (info.status === KeyStatus.INVALID) continue;

      // RATE_LIMITED 也可以选（rate limit 是临时的，不影响使用其他 key）
      if (info.status === KeyStatus.ACTIVE || info.status === KeyStatus.RATE_LIMITED) {
        activeKeys.push(info);
      }
    }

    if (activeKeys.length === 0) {
      return null;
    }

    // 若仅有 RATE_LIMITED key，也选一个（紧急情况）
    // 按 remaining 降序排序，null（不限）视为最高优先级
    const sorted = [...activeKeys].sort((a, b) => {
      // null (unlimited) 排最前
      if (a.remaining === null && b.remaining !== null) return -1;
      if (a.remaining !== null && b.remaining === null) return 1;
      if (a.remaining === null && b.remaining === null) {
        // 两个都不限，随机打散
        return Math.random() - 0.5;
      }
      // 按 remaining 降序
      if ((a.remaining as number) !== (b.remaining as number)) {
        return (b.remaining as number) - (a.remaining as number);
      }
      // remaining 相等，随机打散
      return Math.random() - 0.5;
    });

    return sorted[0].key;
  }

  /**
   * 处理 API 错误，更新 key 状态
   * @returns true 表示可重试（有其他 key 可用），false 表示不应重试
   */
  handleError(key: string, statusCode: number | undefined): boolean {
    const info = this.keyMap.get(key);
    if (!info) return false;

    const now = Date.now();

    switch (statusCode) {
      case 432: // 月度额度耗尽
      case 433: // 预付额度耗尽
        info.status = KeyStatus.QUOTA_EXHAUSTED;
        info.cooldownUntil = now + KeyManager.COOLDOWN_MS;
        info.remaining = 0;
        console.error(
          `[KeyManager] ${sanitizeKey(key)} 返回 ${statusCode}（额度耗尽），` +
          `冷却至下次定时刷新`
        );
        return this.hasActiveKey();

      case 401: // 无效 key
        info.status = KeyStatus.INVALID;
        console.error(
          `[KeyManager] ${sanitizeKey(key)} 返回 401（无效 key），永久移除`
        );
        return this.hasActiveKey();

      case 429: // 临时限流
        info.status = KeyStatus.RATE_LIMITED;
        console.error(
          `[KeyManager] ${sanitizeKey(key)} 返回 429（速率限制），切换其他 key`
        );
        return this.hasActiveKey();

      default:
        // 400、500 等不涉及 key 状态的错误，不重试
        return false;
    }
  }

  /**
   * 检查是否至少有一个可用的 key
   */
  private hasActiveKey(): boolean {
    const now = Date.now();
    for (const info of this.keyMap.values()) {
      if (info.status === KeyStatus.INVALID) continue;
      if (info.status === KeyStatus.QUOTA_EXHAUSTED && info.cooldownUntil > now) continue;
      return true;
    }
    return false;
  }

  /**
   * 获取当前 key 的 Authorization header 值
   */
  getAuthHeader(key: string): string {
    return `Bearer ${key}`;
  }

  /**
   * 获取活跃 key 数量（用于监控）
   */
  getActiveKeyCount(): number {
    const now = Date.now();
    let count = 0;
    for (const info of this.keyMap.values()) {
      if (info.status === KeyStatus.ACTIVE || info.status === KeyStatus.RATE_LIMITED) {
        count++;
      } else if (info.status === KeyStatus.QUOTA_EXHAUSTED && info.cooldownUntil <= now) {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取 key 总数
   */
  getTotalKeyCount(): number {
    return this.keyMap.size;
  }

  /**
   * 定时刷新所有 active key 的额度
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(async () => {
      if (this.refreshing) return;
      this.refreshing = true;

      console.error("[KeyManager] 定时刷新开始...");
      try {
        const keys = Array.from(this.keyMap.keys());
        for (const key of keys) {
          await this.fetchAndUpdateUsage(key);
        }
        console.error("[KeyManager] 定时刷新完成");
        this.logKeyStatus();
      } catch (error) {
        console.error(
          `[KeyManager] 定时刷新异常: ${(error as Error).message}`
        );
      } finally {
        this.refreshing = false;
      }
    }, KeyManager.REFRESH_INTERVAL_MS);

    // 允许进程退出（不阻塞）
    if (this.refreshTimer && typeof this.refreshTimer === "object" && "unref" in this.refreshTimer) {
      this.refreshTimer.unref();
    }
  }

  /**
   * 停止定时刷新（用于测试）
   */
  stopPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 获取指定 key 的信息（用于测试）
   */
  getKeyInfo(key: string): KeyInfo | undefined {
    return this.keyMap.get(key);
  }

  /**
   * 手动添加 key（用于测试）
   */
  _addKeyForTest(key: string, info: Partial<KeyInfo> = {}): void {
    this.keyMap.set(key, {
      key,
      status: KeyStatus.ACTIVE,
      remaining: null,
      limit: null,
      lastQueryAt: 0,
      cooldownUntil: 0,
      ...info,
    });
  }

  /**
   * 打印所有 key 状态（脱敏）
   */
  private logKeyStatus(): void {
    const now = Date.now();
    for (const [key, info] of this.keyMap.entries()) {
      const remainingStr = info.remaining !== null ? `${info.remaining}` : "?";
      const limitStr = info.limit !== null ? `${info.limit}` : "∞";
      const cooldownStr =
        info.cooldownUntil > now
          ? ` (冷却 ${Math.ceil((info.cooldownUntil - now) / 1000)}s)`
          : "";
      console.error(
        `  ${sanitizeKey(key)}: status=${info.status}, ` +
        `remaining=${remainingStr}/${limitStr}${cooldownStr}`
      );
    }
  }
}
