import { Controller, Get } from '@nestjs/common';
import { BackendHealthService } from './observability/backend-health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly backendHealth: BackendHealthService) {}

  @Get()
  async health(): Promise<Record<string, unknown>> {
    return {
      service: 'mygame-backend',
      ...(await this.backendHealth.snapshot()),
    };
  }
}
