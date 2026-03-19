import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import express from 'express';
import { createHmac } from 'crypto';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';

describe('Webhooks (e2e)', () => {
  const secret = 'test_kapso_webhook_secret';
  const nestedPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '987654321',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '573001112233',
                phone_number_id: 'kapso-phone-id',
              },
              contacts: [
                {
                  profile: { name: 'Test User' },
                  wa_id: '573001234567',
                },
              ],
              messages: [
                {
                  from: '573001234567',
                  id: 'msg_e2e_nested',
                  timestamp: '1717000000',
                  text: { body: 'Hola desde Kapso' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  let app: any;
  let queue: { add: jest.Mock };

  beforeAll(async () => {
    process.env.KAPSO_WEBHOOK_SECRET = secret;

    queue = { add: jest.fn(async () => ({ id: 'job_1' })) };

    const keys = new Set<string>();
    const redis = {
      set: jest.fn(
        async (key: string, _val: string, _ex: string, _ttl: number, _nx: string) => {
          if (keys.has(key)) return null;
          keys.add(key);
          return 'OK';
        },
      ),
      del: jest.fn(async (key: string) => {
        keys.delete(key);
        return 1;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken('incoming-messages'), useValue: queue },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.useLogger(false);
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf;
        },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  function sign(payload: unknown): string {
    const raw = Buffer.from(JSON.stringify(payload));
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  it('valid signature + new message returns 200 and enqueues', async () => {
    const payload = nestedPayload;

    await request(app.getHttpServer())
      .post('/webhooks/kapso')
      .set('X-Webhook-Signature', sign(payload))
      .send(payload)
      .expect(200);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenLastCalledWith('process-message', {
      messageId: 'msg_e2e_nested',
      payload,
    });
  });

  it('invalid signature returns 401 without enqueueing', async () => {
    const payload = { message: { id: 'msg_e2e_2' } };

    await request(app.getHttpServer())
      .post('/webhooks/kapso')
      .set('X-Webhook-Signature', 'bad')
      .send(payload)
      .expect(401);

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('duplicate delivery returns 200 and enqueues once', async () => {
    const payload = { message: { id: 'msg_e2e_dup' } };
    const signature = sign(payload);

    await request(app.getHttpServer())
      .post('/webhooks/kapso')
      .set('X-Webhook-Signature', signature)
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/webhooks/kapso')
      .set('X-Webhook-Signature', signature)
      .send(payload)
      .expect(200);

    // First test already enqueued once, and this test should enqueue once more (only the first request here).
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('enqueue-path response time is under 100ms in test conditions', async () => {
    const payload = { message: { id: 'msg_e2e_perf' } };
    const signature = sign(payload);

    const start = process.hrtime.bigint();
    await request(app.getHttpServer())
      .post('/webhooks/kapso')
      .set('X-Webhook-Signature', signature)
      .send(payload)
      .expect(200);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(elapsedMs).toBeLessThan(100);
  });
});
