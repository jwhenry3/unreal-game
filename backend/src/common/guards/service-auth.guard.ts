import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header('x-service-key');
    const configuredKeys = (this.config.get<string>('INTERNAL_API_KEYS') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);

    if (!providedKey || configuredKeys.length === 0) {
      throw new UnauthorizedException('A valid internal service key is required.');
    }

    const provided = Buffer.from(providedKey);
    const authorized = configuredKeys.some((key) => {
      const expected = Buffer.from(key);
      return expected.length === provided.length && timingSafeEqual(expected, provided);
    });

    if (!authorized) {
      throw new UnauthorizedException('A valid internal service key is required.');
    }

    return true;
  }
}
