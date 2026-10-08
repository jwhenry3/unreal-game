import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');

  app.use(helmet());
  app.enableCors({
    origin:
      corsOrigin === '*'
        ? true
        : corsOrigin
          ? corsOrigin.split(',').map((origin) => origin.trim())
          : false,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const configuredPort = Number.parseInt(config.get<string>('PORT', '3000'), 10);
  await app.listen(
    Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000,
    '0.0.0.0',
  );
}

void bootstrap();
