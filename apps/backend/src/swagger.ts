import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  KapsoWebhookDuplicateResponseDto,
  KapsoWebhookDocDto,
  KapsoWebhookEnqueuedResponseDto,
  KapsoWebhookIgnoredResponseDto,
} from './webhooks/dto/kapso-webhook-doc.dto';

export function configureSwagger(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SN8 WPP CRM Backend API')
    .setDescription(
      'Documentacion OpenAPI del backend para autenticacion, conversaciones y webhooks.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'Cookie httpOnly emitida por `POST /auth/login`.',
      },
      'access_token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Alternativa para clientes que envian `Authorization: Bearer <token>`.',
      },
      'access_token_bearer',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [
      KapsoWebhookDocDto,
      KapsoWebhookIgnoredResponseDto,
      KapsoWebhookDuplicateResponseDto,
      KapsoWebhookEnqueuedResponseDto,
    ],
  });

  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return swaggerDocument;
}
