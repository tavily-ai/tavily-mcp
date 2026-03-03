// @ts-nocheck
/**
 * MetricsController — Prometheus scrape endpoint for Grafana Alloy.
 *
 * Exposes a single route:
 *   GET /metrics  →  Prometheus text exposition format (Content-Type: text/plain)
 *
 * Grafana Alloy configuration (alloy.river):
 * ─────────────────────────────────────────
 *   prometheus.scrape "nestjs_app" {
 *     targets = [{ __address__ = "localhost:3000" }]
 *     forward_to = [prometheus.remote_write.default.receiver]
 *     metrics_path = "/metrics"
 *     scrape_interval = "15s"
 *   }
 *
 * Security note:
 *   The /metrics endpoint MUST be protected in production.
 *   Options:
 *     A) Network policy — allow only the Alloy scraper IP.
 *     B) Bearer token guard — add a NestJS Guard that checks
 *        `Authorization: Bearer <METRICS_TOKEN>` against an env var.
 *     C) Separate internal port — bind the metrics server on a
 *        non-public port (e.g. 9090) using a second NestJS app instance.
 *
 *   This reference implementation uses option A (network policy) and
 *   leaves the endpoint unauthenticated for simplicity.  Add a Guard
 *   if your threat model requires it.
 *
 * Required npm packages:
 *   npm install prom-client
 */

import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * GET /metrics
   *
   * Returns all registered Prometheus metrics in text exposition format.
   * Grafana Alloy (and any Prometheus-compatible scraper) can consume this.
   *
   * The Content-Type is set dynamically from the registry so it correctly
   * advertises `text/plain; version=0.0.4; charset=utf-8` (Prometheus default)
   * or `application/openmetrics-text` if OpenMetrics is enabled.
   */
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    const [body, contentType] = await Promise.all([
      this.metrics.getMetrics(),
      Promise.resolve(this.metrics.getContentType()),
    ]);

    res.setHeader('Content-Type', contentType);
    res.end(body);
  }
}
