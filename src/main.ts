import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // For Swagger UI
    }),
  );

  // CORS restricted appropriately
  app.enableCors({
    origin: ['http://localhost:1420', 'http://localhost:3000', 'tauri://localhost', 'http://127.0.0.1:1420'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'stripe-signature', 'x-webhook-signature'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global request ID and error formatting
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger / OpenAPI setup (Section 72)
  const config = new DocumentBuilder()
    .setTitle('Meeting Recorder SaaS API')
    .setDescription('Full commercial SaaS Backend, Auth, Licensing, Subscriptions, Usage, Admin APIs, and Webhooks')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Meeting Recorder SaaS Backend running on http://localhost:${port}`);
  console.log(`Swagger OpenAPI documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
