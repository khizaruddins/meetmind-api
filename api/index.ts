import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { Request, Response } from 'express';

// Use require to support CommonJS without requiring esModuleInterop flag
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('express');

let cachedServer: any;

async function bootstrapServer(): Promise<any> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  // Configure middleware, pipes, filters, CORS, and Swagger
  configureApp(app);

  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedServer) {
    cachedServer = await bootstrapServer();
  }
  return cachedServer(req, res);
}
