import { NestFactory } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';

function resolveLogLevels(level: string): LogLevel[] {
  const map: Record<string, LogLevel[]> = {
    error: ['error'],
    warn: ['error', 'warn'],
    info: ['error', 'warn', 'log'],
    debug: ['error', 'warn', 'log', 'debug'],
  };
  return map[level] ?? map['info'];
}

async function bootstrap(): Promise<void> {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveLogLevels(logLevel),
  });
  app.enableShutdownHooks();
  Logger.log(`Marcus arrancó (LOG_LEVEL=${logLevel})`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap falló', err);
  process.exit(1);
});
