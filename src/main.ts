import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply shared middleware, pipes, filters, CORS, and Swagger
  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Meeting Recorder SaaS Backend running on http://localhost:${port}`);
  console.log(`Swagger OpenAPI documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
