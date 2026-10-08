import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ObservabilityEvent {
  kind: string;
  level?: 'info' | 'warn' | 'error' | 'fatal';
  name: string;
  message?: string;
  attributes?: Record<string, unknown>;
  timestamp?: string;
}

@Injectable()
export class ObservabilityClient implements OnApplicationShutdown {
  private readonly endpoint: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly service: string;
  private readonly queue: ObservabilityEvent[] = [];
  private readonly flushTimer: NodeJS.Timeout;
  private flushing = false;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('OBSERVABILITY_URL')?.replace(/\/$/, '');
    this.apiKey = config.get<string>('OBSERVABILITY_API_KEY');
    this.service = config.get<string>('OBSERVABILITY_SERVICE', 'mygame-backend');
    this.flushTimer = setInterval(() => void this.flush(), 500);
    this.flushTimer.unref();
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  emit(event: ObservabilityEvent): void {
    if (!this.endpoint || !this.apiKey) return;
    if (this.queue.length >= 1_000) this.queue.shift();
    this.queue.push({ ...event, timestamp: event.timestamp ?? new Date().toISOString() });
    if (this.queue.length >= 50) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.endpoint || !this.apiKey || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, 100).map((event) => ({ ...event, service: this.service }));
    try {
      const response = await fetch(`${this.endpoint}/v1/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-observability-key': this.apiKey,
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) this.queue.unshift(...batch);
    } catch {
      this.queue.unshift(...batch);
    } finally {
      if (this.queue.length > 1_000) this.queue.splice(0, this.queue.length - 1_000);
      this.flushing = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.flushTimer);
    await this.flush();
  }
}
