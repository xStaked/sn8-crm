import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureSwagger } from './swagger';

type RawBodyRequest = Request & { rawBody?: Buffer };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const allowedOrigins = (
    process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Capture the exact raw request body so we can verify webhook signatures.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      },
    }),
  );

  app.use(cookieParser());
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
  });
  configureSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
