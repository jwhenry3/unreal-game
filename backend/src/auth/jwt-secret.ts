import { ConfigService } from '@nestjs/config';

export function getJwtSecret(config: ConfigService): string {
  const configuredSecret = config.get<string>('JWT_SECRET');
  if (configuredSecret) {
    return configuredSecret;
  }

  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }

  return 'development-only-jwt-secret-change-me';
}
