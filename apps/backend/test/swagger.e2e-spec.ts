import { Test } from '@nestjs/testing';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ConversationsController } from '../src/conversations/conversations.controller';
import { ConversationsService } from '../src/conversations/conversations.service';
import { configureSwagger } from '../src/swagger';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';

describe('Swagger (e2e)', () => {
  let app: any;
  let document: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, ConversationsController, WebhooksController],
      providers: [
        { provide: AuthService, useValue: { login: jest.fn() } },
        { provide: ConversationsService, useValue: {} },
        { provide: WebhooksService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    document = configureSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('publishes auth, conversations and webhook routes in the OpenAPI document', async () => {
    expect(document.paths['/auth/login']?.post).toBeDefined();
    expect(document.paths['/auth/me']?.get).toBeDefined();
    expect(document.paths['/conversations']?.get).toBeDefined();
    expect(document.paths['/conversations/{conversationId}/messages']?.get).toBeDefined();
    expect(document.paths['/webhooks/kapso']?.post).toBeDefined();
  });

  it('declares cookie auth and webhook union responses', async () => {
    expect(document.components?.securitySchemes?.access_token).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    });

    const webhookResponse = document.paths['/webhooks/kapso']?.post?.responses?.['200'];
    expect(webhookResponse).toBeDefined();
    expect(
      (webhookResponse as { content?: { 'application/json'?: { schema?: { oneOf?: unknown[] } } } })
        .content?.['application/json']?.schema?.oneOf,
    ).toHaveLength(3);
  });
});
