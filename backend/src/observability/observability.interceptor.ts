import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { ObservabilityClient } from './observability-client.service';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityClient) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    let errorName: string | undefined;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          errorName = error instanceof Error ? error.name : 'UnknownError';
        },
        finalize: () => {
          const statusCode = response.statusCode;
          const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
          this.observability.emit({
            kind: 'request',
            level,
            name: `${request.method} ${request.route?.path ?? request.path}`,
            message: errorName ?? `${statusCode}`,
            attributes: {
              method: request.method,
              path: request.path,
              statusCode,
              durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
              errorName,
            },
          });
        },
      }),
    );
  }
}
