# Metrics Setup Prompt

## Context
Setting up Prometheus metrics and Grafana Alloy configuration for a new module or service.

## Input
- Module name: <module-name>
- Service purpose: <brief-description>
- Key operations to track: <operation-list>

## Tasks

### 1. Create Metrics Module (if not exists)
```typescript
// <module-name>/metrics/<module-name>.metrics.ts
import { Counter, Histogram, register } from 'prom-client';

export const <moduleName>Metrics = {
  operationsTotal: new Counter({
    name: '<module_name>_operations_total',
    help: 'Total number of <module-name> operations',
    labelNames: ['operation', 'status'],
  }),
  
  durationSeconds: new Histogram({
    name: '<module_name>_duration_seconds',
    help: 'Duration of <module-name> operations',
    labelNames: ['operation'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),
};
```

### 2. Instrument Service Methods
```typescript
// In your service method
async performOperation(data: any) {
  const end = <moduleName>Metrics.durationSeconds.startTimer({ operation: 'perform_operation' });
  
  try {
    // ... operation logic
    <moduleName>Metrics.operationsTotal.inc({ operation: 'perform_operation', status: 'success' });
    return result;
  } catch (error) {
    <moduleName>Metrics.operationsTotal.inc({ operation: 'perform_operation', status: 'failure' });
    throw error;
  } finally {
    end();
  }
}
```

### 3. Update Alloy Configuration
Add to `nestjs-reference/alloy/alloy.river`:
```river
prometheus.scrape "<module_name>" {
  targets = [{ __address__ = "localhost:3000" }]
  forward_to = [prometheus.remote_write.default.receiver]
  metrics_path = "/metrics"
  scrape_interval = "15s"
  job_name = "<module-name>"
}
```

### 4. Verify Metrics Endpoint
Ensure `MetricsController` exposes the new metrics at `GET /metrics`.

### 5. Document Metrics
Add to module README:
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `<module_name>_operations_total` | Counter | `operation`, `status` | Total operations |
| `<module_name>_duration_seconds` | Histogram | `operation` | Operation duration |

## Compliance Check
- [ ] All financial operations include amount metrics (if applicable)
- [ ] PII is never included in metric labels
- [ ] Metric names follow `snake_case` convention
- [ ] Labels are consistent with existing metrics

