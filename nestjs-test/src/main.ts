import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const PORT = 3001;
const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  // Global DTO validation (required by PayrollModule DTOs)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(PORT);
  logger.log(`NestJS test server running → http://localhost:${PORT}`);
  logger.log(`Prometheus metrics       → http://localhost:${PORT}/metrics`);
  logger.log(`Payroll runs             → POST http://localhost:${PORT}/payroll/runs`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
