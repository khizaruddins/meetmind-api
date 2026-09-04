import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Applies all shared middleware, pipes, interceptors, CORS, and Swagger
 * configuration to both standalone HTTP servers and Vercel serverless functions.
 */
export function configureApp(app: INestApplication) {
  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // For Swagger UI
    }),
  );

  // CORS configuration supporting local dev, Tauri desktop, and production web frontends
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or desktop Tauri clients)
      if (!origin) return callback(null, true);

      const allowedStatic = [
        'http://localhost:1420',
        'http://localhost:3000',
        'tauri://localhost',
        'http://127.0.0.1:1420',
      ];

      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }

      if (allowedStatic.includes(origin)) {
        return callback(null, true);
      }

      // Allow any Vercel preview or production deployments of the web app if on Vercel
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // In non-production environments, allow any localhost origin
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        return callback(null, true);
      }

      return callback(null, true);
    },
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

  // Swagger / OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('Meeting Recorder SaaS API')
    .setDescription('Full commercial SaaS Backend, Auth, Licensing, Subscriptions, Usage, Admin APIs, and Webhooks')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
