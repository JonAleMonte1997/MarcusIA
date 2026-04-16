import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Marcus arrancó', 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap falló', err);
  process.exit(1);
});
