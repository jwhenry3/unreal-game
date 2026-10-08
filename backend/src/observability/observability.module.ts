import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BackendHealthService } from './backend-health.service';
import { ObservabilityClient } from './observability-client.service';
import { ObservabilityInterceptor } from './observability.interceptor';

@Global()
@Module({
  providers: [
    ObservabilityClient,
    BackendHealthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ObservabilityInterceptor,
    },
  ],
  exports: [ObservabilityClient, BackendHealthService],
})
export class ObservabilityModule {}
