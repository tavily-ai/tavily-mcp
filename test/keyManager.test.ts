/**
 * KeyManager 单元测试
 * 使用 vitest，mock axios 依赖
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyManager, KeyStatus, sanitizeKey } from '../src/keyManager.js';

// Mock axios
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(),
    },
    isAxiosError: vi.fn((err: any) => err && err.__isAxiosError === true),
  };
});

import axios from 'axios';

// 辅助函数：创建 axios 错误
function createAxiosError(status: number, data?: any): any {
  return {
    __isAxiosError: true,
    response: { status, data },
    message: `Request failed with status code ${status}`,
  };
}

// 辅助函数：创建 /usage 成功响应
function createUsageResponse(usage: number, limit: number | null): any {
  return {
    data: {
      key: { usage, limit },
      account: { current_plan: 'free', plan_usage: usage, plan_limit: 15000 },
    },
  };
}

describe('sanitizeKey', () => {
  it('脱敏短 key（仅显示前 4 位 + ***）', () => {
    expect(sanitizeKey('tvly-abc')).toBe('tvly***');
  });

  it('脱敏长 key（仅显示前 8 位 + ***）', () => {
    expect(sanitizeKey('tvly-dev-abcdefghijklmnop')).toBe('tvly-dev***');
  });

  it('空 key 返回 <empty>', () => {
    expect(sanitizeKey('')).toBe('<empty>');
  });
});

describe('KeyManager - key 加载', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // 清除所有 TAVILY 相关环境变量
    delete process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEYS;
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('TAVILY_API_KEY_')) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('从 TAVILY_API_KEYS 加载多个 key（逗号分隔）', () => {
    process.env.TAVILY_API_KEYS = 'key1, key2 ,key3';
    const km = new KeyManager();
    expect(km.getTotalKeyCount()).toBe(3);
  });

  it('从 TAVILY_API_KEY_* 后缀加载多个 key', () => {
    process.env.TAVILY_API_KEY_A = 'tvly-suffix-key1';
    process.env.TAVILY_API_KEY_B = 'tvly-suffix-key2';
    process.env.TAVILY_API_KEY_C = 'tvly-suffix-key3';
    const km = new KeyManager();
    expect(km.getTotalKeyCount()).toBe(3);
  });

  it('从单个 TAVILY_API_KEY 加载（向后兼容）', () => {
    process.env.TAVILY_API_KEY = 'single-key';
    const km = new KeyManager();
    expect(km.getTotalKeyCount()).toBe(1);
  });

  it('去重：相同 key 只保留一份', () => {
    process.env.TAVILY_API_KEYS = 'key1,key1,key2';
    const km = new KeyManager();
    expect(km.getTotalKeyCount()).toBe(2);
  });

  it('无任何 key 时抛出明确错误', () => {
    expect(() => new KeyManager()).toThrow(/未找到任何有效的 Tavily API key/);
  });

  it('TAVILY_API_KEYS 和 TAVILY_API_KEY 同时存在时合并', () => {
    process.env.TAVILY_API_KEYS = 'key1,key2';
    process.env.TAVILY_API_KEY = 'key3';
    const km = new KeyManager();
    expect(km.getTotalKeyCount()).toBe(3);
  });
});

describe('KeyManager - key 选择策略', () => {
  let km: KeyManager;

  beforeEach(() => {
    vi.resetModules();
    process.env = { TAVILY_API_KEYS: 'key1,key2,key3' };
    km = new KeyManager();
    // 手动设置 key 信息（跳过 /usage 查询）
    (km as any)._addKeyForTest('key1', { remaining: 100, limit: 1000, status: KeyStatus.ACTIVE });
    (km as any)._addKeyForTest('key2', { remaining: 500, limit: 1000, status: KeyStatus.ACTIVE });
    (km as any)._addKeyForTest('key3', { remaining: 300, limit: 1000, status: KeyStatus.ACTIVE });
  });

  afterEach(() => {
    process.env = {};
  });

  it('选择 remaining 最大的 active key', () => {
    const selected = km.selectKey();
    expect(selected).toBe('key2'); // 500 > 300 > 100
  });

  it('null remaining（不限）的 key 优先于有限额的 key', () => {
    (km as any)._addKeyForTest('key4', { remaining: null, limit: null, status: KeyStatus.ACTIVE });
    // key4 has null remaining → highest priority
    // Will be selected sometimes (random shuffle among null keys)
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(km.selectKey()!);
    }
    expect(results.has('key4')).toBe(true);
  });

  it('所有 key 满额时返回 null', () => {
    (km as any)._addKeyForTest('key1', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    (km as any)._addKeyForTest('key2', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    (km as any)._addKeyForTest('key3', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    expect(km.selectKey()).toBeNull();
  });

  it('跳过 INVALID 状态的 key', () => {
    (km as any)._addKeyForTest('key1', { status: KeyStatus.INVALID });
    const selected = km.selectKey();
    expect(selected).not.toBe('key1');
  });

  it('RATE_LIMITED 的 key 仍可被选中', () => {
    (km as any)._addKeyForTest('key1', { remaining: 999, limit: 1000, status: KeyStatus.RATE_LIMITED });
    (km as any)._addKeyForTest('key2', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    (km as any)._addKeyForTest('key3', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    const selected = km.selectKey();
    expect(selected).toBe('key1');
  });
});

describe('KeyManager - 错误处理', () => {
  let km: KeyManager;

  beforeEach(() => {
    vi.resetModules();
    process.env = { TAVILY_API_KEYS: 'key1,key2,key3' };
    km = new KeyManager();
    (km as any)._addKeyForTest('key1', { remaining: 100, limit: 1000, status: KeyStatus.ACTIVE });
    (km as any)._addKeyForTest('key2', { remaining: 500, limit: 1000, status: KeyStatus.ACTIVE });
    (km as any)._addKeyForTest('key3', { remaining: 300, limit: 1000, status: KeyStatus.ACTIVE });
  });

  afterEach(() => {
    process.env = {};
  });

  it('432 → 冷却 key，返回 true（可重试：还有活跃 key）', () => {
    const result = km.handleError('key1', 432);
    expect(result).toBe(true); // 可重试
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.QUOTA_EXHAUSTED);
    expect(info?.cooldownUntil).toBeGreaterThan(0);
  });

  it('433 → 冷却 key', () => {
    const result = km.handleError('key2', 433);
    expect(result).toBe(true);
    const info = km.getKeyInfo('key2');
    expect(info?.status).toBe(KeyStatus.QUOTA_EXHAUSTED);
  });

  it('401 → 永久移除 key', () => {
    const result = km.handleError('key3', 401);
    expect(result).toBe(true); // 还有活跃 key 可重试
    const info = km.getKeyInfo('key3');
    expect(info?.status).toBe(KeyStatus.INVALID);
  });

  it('429 → 标记限流但可重试', () => {
    const result = km.handleError('key1', 429);
    expect(result).toBe(true);
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.RATE_LIMITED);
  });

  it('400 → 不改变 key 状态，返回 false', () => {
    const result = km.handleError('key1', 400);
    expect(result).toBe(false);
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.ACTIVE);
  });

  it('500 → 不改变 key 状态，返回 false', () => {
    const result = km.handleError('key1', 500);
    expect(result).toBe(false);
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.ACTIVE);
  });

  it('所有 key 满额后返回 false（不可重试）', () => {
    km.handleError('key1', 432);
    km.handleError('key2', 432);
    const result = km.handleError('key3', 432);
    expect(result).toBe(false); // 没有更多活跃 key
  });
});

describe('KeyManager - /usage 查询', () => {
  let km: KeyManager;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { TAVILY_API_KEYS: 'key1,key2' };
    km = new KeyManager();
  });

  afterEach(() => {
    process.env = originalEnv;
    km.stopPeriodicRefresh();
  });

  it('成功查询 /usage 后更新 remaining 和 limit', async () => {
    const mockGet = axios.get as any;
    mockGet.mockResolvedValueOnce(createUsageResponse(150, 1000));
    mockGet.mockResolvedValueOnce(createUsageResponse(500, 1000));

    await km.fetchAndUpdateUsage('key1');
    await km.fetchAndUpdateUsage('key2');

    expect(km.getKeyInfo('key1')?.remaining).toBe(850); // 1000 - 150
    expect(km.getKeyInfo('key1')?.limit).toBe(1000);
    expect(km.getKeyInfo('key2')?.remaining).toBe(500);
  });

  it('key.limit 为 null 时 remaining 也为 null（不限）', async () => {
    const mockGet = axios.get as any;
    mockGet.mockResolvedValueOnce(createUsageResponse(0, null));

    await km.fetchAndUpdateUsage('key1');
    expect(km.getKeyInfo('key1')?.remaining).toBeNull();
    expect(km.getKeyInfo('key1')?.limit).toBeNull();
  });

  it('/usage 返回 401 → 标记 key 为 INVALID', async () => {
    const mockGet = axios.get as any;
    mockGet.mockRejectedValueOnce(createAxiosError(401));

    await km.fetchAndUpdateUsage('key1');
    expect(km.getKeyInfo('key1')?.status).toBe(KeyStatus.INVALID);
  });

  it('/usage 查询网络错误 → 降级，保持 ACTIVE', async () => {
    const mockGet = axios.get as any;
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    await km.fetchAndUpdateUsage('key1');
    expect(km.getKeyInfo('key1')?.status).toBe(KeyStatus.ACTIVE);
    expect(km.getKeyInfo('key1')?.remaining).toBeNull(); // 降级为 unknown
  });

  it('已满额 key 在 /usage 显示恢复后自动激活', async () => {
    // 先标记为满额
    (km as any)._addKeyForTest('key1', {
      remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED,
      cooldownUntil: Date.now() + 999999,
    });

    // 查询显示 usage 下降了
    const mockGet = axios.get as any;
    mockGet.mockResolvedValueOnce(createUsageResponse(500, 1000));

    await km.fetchAndUpdateUsage('key1');
    expect(km.getKeyInfo('key1')?.status).toBe(KeyStatus.ACTIVE);
    expect(km.getKeyInfo('key1')?.cooldownUntil).toBe(0);
  });
});

describe('KeyManager - active key 计数', () => {
  it('getActiveKeyCount 正确计数', () => {
    process.env = { TAVILY_API_KEYS: 'k1,k2,k3,k4' };
    const km = new KeyManager();
    (km as any)._addKeyForTest('k1', { remaining: 100, limit: 1000, status: KeyStatus.ACTIVE });
    (km as any)._addKeyForTest('k2', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() + 999999 });
    (km as any)._addKeyForTest('k3', { remaining: 50, limit: 1000, status: KeyStatus.RATE_LIMITED });
    (km as any)._addKeyForTest('k4', { remaining: null, limit: null, status: KeyStatus.INVALID });

    // ACTIVE + RATE_LIMITED = 2; INVALID excluded; QUOTA_EXHAUSTED in cooldown excluded
    expect(km.getActiveKeyCount()).toBe(2);
    process.env = {};
  });

  it('冷却到期的 QUOTA_EXHAUSTED key 计入 active', () => {
    process.env = { TAVILY_API_KEYS: 'k1,k2' };
    const km = new KeyManager();
    (km as any)._addKeyForTest('k1', { remaining: 0, limit: 1000, status: KeyStatus.QUOTA_EXHAUSTED, cooldownUntil: Date.now() - 1000 });
    (km as any)._addKeyForTest('k2', { remaining: 100, limit: 1000, status: KeyStatus.ACTIVE });
    
    // 冷却到期的 key 也被计入 active
    expect(km.getActiveKeyCount()).toBe(2);
    process.env = {};
  });
});

describe('KeyManager - 定时刷新', () => {
  let km: KeyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { TAVILY_API_KEYS: 'key1' };
    km = new KeyManager();
  });

  afterEach(() => {
    process.env = {};
    km.stopPeriodicRefresh();
  });

  it('stopPeriodicRefresh 成功清除定时器', () => {
    // 启动定时刷新（会调用 setInterval）
    (km as any).startPeriodicRefresh();
    expect((km as any).refreshTimer).toBeTruthy();
    
    km.stopPeriodicRefresh();
    expect((km as any).refreshTimer).toBeNull();
  });
});

describe('KeyManager - fetchAndUpdateUsage 边界情况', () => {
  let km: KeyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { TAVILY_API_KEYS: 'key1,key2' };
    km = new KeyManager();
  });

  afterEach(() => {
    process.env = {};
    km.stopPeriodicRefresh();
  });

  it('usage >= limit 时自动标记为 QUOTA_EXHAUSTED', async () => {
    const mockGet = axios.get as any;
    mockGet.mockResolvedValueOnce(createUsageResponse(1000, 1000)); // 刚好满额

    (km as any)._addKeyForTest('key1', { remaining: 0, limit: 1000, status: KeyStatus.ACTIVE });
    
    // 调用前确保 key 在 keyMap 中
    await km.fetchAndUpdateUsage('key1');
    
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.QUOTA_EXHAUSTED);
    expect(info?.remaining).toBe(0);
  });

  it('key 不在 keyMap 中时 fetchAndUpdateUsage 安全返回', async () => {
    // 不应抛出异常
    await expect(km.fetchAndUpdateUsage('nonexistent')).resolves.toBeUndefined();
  });

  it('已 INVALID 的 key 跳过 fetchAndUpdateUsage', async () => {
    const mockGet = axios.get as any;
    (km as any)._addKeyForTest('key1', { status: KeyStatus.INVALID });

    await km.fetchAndUpdateUsage('key1');
    
    // mockGet 不应被调用（INVALID key 跳过）
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('KeyManager - 冷却到期恢复', () => {
  it('selectKey 自动恢复冷却到期的 key', () => {
    process.env = { TAVILY_API_KEYS: 'key1,key2' };
    const km = new KeyManager();
    
    // key1 冷却已到期
    (km as any)._addKeyForTest('key1', { 
      remaining: 0, limit: 1000, 
      status: KeyStatus.QUOTA_EXHAUSTED, 
      cooldownUntil: Date.now() - 1000  // 1 秒前到期
    });
    (km as any)._addKeyForTest('key2', { 
      remaining: 0, limit: 1000, 
      status: KeyStatus.QUOTA_EXHAUSTED, 
      cooldownUntil: Date.now() + 999999  // 仍在冷却
    });
    
    const selected = km.selectKey();
    expect(selected).toBe('key1'); // 冷却到期的 key 被恢复
    
    const info = km.getKeyInfo('key1');
    expect(info?.status).toBe(KeyStatus.ACTIVE);
    expect(info?.cooldownUntil).toBe(0);
    
    process.env = {};
  });
});

describe('KeyManager - 初始化流程', () => {
  let km: KeyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { TAVILY_API_KEYS: 'key1,key2' };
    km = new KeyManager();
  });

  afterEach(() => {
    process.env = {};
    km.stopPeriodicRefresh();
  });

  it('initialize 调用 fetchAndUpdateUsage 并输出状态', async () => {
    const mockGet = axios.get as any;
    mockGet.mockResolvedValueOnce(createUsageResponse(200, 1000));
    mockGet.mockResolvedValueOnce(createUsageResponse(300, 1000));

    await km.initialize();

    expect(km.getKeyInfo('key1')?.remaining).toBe(800);
    expect(km.getKeyInfo('key2')?.remaining).toBe(700);
    // logKeyStatus 会被调用（验证不报错即可）
  });

  it('initialize 空 keyMap 不报错', async () => {
    // 创建 KeyManager 后清空 keyMap，验证 initialize() 安全返回不抛异常
    const km2 = new KeyManager();
    // 通过反射清空 keyMap 模拟空池场景
    (km2 as any).keyMap.clear();
    // initialize 应安全返回（keys.length === 0 时直接 return）
    await expect(km2.initialize()).resolves.toBeUndefined();
    // 确认没有定时器残留
    expect((km2 as any).refreshTimer).toBeNull();
    km2.stopPeriodicRefresh();
  });
});

describe('KeyManager - handleError 未知 key', () => {
  it('handleError 对未知 key 返回 false', () => {
    process.env = { TAVILY_API_KEY: 'k1' };
    const km = new KeyManager();
    const result = km.handleError('unknown-key', 432);
    expect(result).toBe(false);
    process.env = {};
  });
});
