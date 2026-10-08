import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ObservabilityClient } from './observability-client.service';

@Injectable()
export class BackendHealthService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly observability: ObservabilityClient,
  ) {}

  onApplicationBootstrap(): void {
    void this.report();
    this.timer = setInterval(() => void this.report(), 10_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async snapshot(): Promise<Record<string, unknown>> {
    const startedAt = performance.now();
    let database = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'error';
    }
    const memory = process.memoryUsage();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      databaseLatencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      nodeVersion: process.version,
      processId: process.pid,
      telemetryQueueDepth: this.observability.queueDepth,
    };
  }

  private async report(): Promise<void> {
    const snapshot = await this.snapshot();
    this.observability.emit({
      kind: 'health',
      level: snapshot.status === 'ok' ? 'info' : 'error',
      name: 'backend.heartbeat',
      message: String(snapshot.status),
      attributes: snapshot,
    });
  }
}
