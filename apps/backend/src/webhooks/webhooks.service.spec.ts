import { ServiceUnavailableException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const messageId = 'msg_123';
  const nestedPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: messageId,
                  from: '573001234567',
                  text: { body: 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  let redis: { set: jest.Mock; del: jest.Mock };
  let queue: { add: jest.Mock };
  let ownerReviewService: { handleOwnerCommand: jest.Mock };
  let messageProcessor: { process: jest.Mock };
  let service: WebhooksService;

  beforeEach(() => {
    redis = {
      set: jest.fn(),
      del: jest.fn(),
    };
    queue = {
      add: jest.fn(),
    };
    ownerReviewService = {
      handleOwnerCommand: jest.fn().mockResolvedValue(false),
    };
    messageProcessor = {
      process: jest.fn().mockResolvedValue(undefined),
    };

    service = new WebhooksService(
      queue as any,
      redis as any,
      ownerReviewService as any,
      messageProcessor as any,
    );
  });

  it('enqueues a new delivery once', async () => {
    redis.set.mockResolvedValue('OK');
    queue.add.mockResolvedValue({ id: 'job_1' });

    await expect(
      service.handleKapsoWebhook(
        { message: { id: messageId, from: '573001234567' } } as any,
        undefined,
      ),
    ).resolves.toMatchObject({ status: 'enqueued', messageId });

    expect(redis.set).toHaveBeenCalledWith(`wh:msg:${messageId}`, '1', 'EX', 86400, 'NX');
    expect(queue.add).toHaveBeenCalledWith('process-message', {
      messageId,
      payload: { message: { id: messageId, from: '573001234567' } },
    });
    expect(messageProcessor.process).toHaveBeenCalledWith({
      data: {
        messageId,
        payload: { message: { id: messageId, from: '573001234567' } },
      },
    });
  });

  it('extracts the message id from a nested Meta-style payload', async () => {
    redis.set.mockResolvedValue('OK');
    queue.add.mockResolvedValue({ id: 'job_1' });

    await expect(service.handleKapsoWebhook(nestedPayload as any, undefined)).resolves.toMatchObject({
      status: 'enqueued',
      messageId,
    });

    expect(redis.set).toHaveBeenCalledWith(`wh:msg:${messageId}`, '1', 'EX', 86400, 'NX');
    expect(queue.add).toHaveBeenCalledWith('process-message', {
      messageId,
      payload: nestedPayload,
    });
    expect(messageProcessor.process).toHaveBeenCalledWith({
      data: {
        messageId,
        payload: nestedPayload,
      },
    });
  });

  it('does not enqueue a duplicate delivery and emits webhook_duplicate_skipped log', async () => {
    redis.set.mockResolvedValue(null);

    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(
      service.handleKapsoWebhook(
        { message: { id: messageId, from: '573001234567' } } as any,
        undefined,
      ),
    ).resolves.toMatchObject({ status: 'duplicate', messageId });

    expect(queue.add).not.toHaveBeenCalled();
    expect(messageProcessor.process).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'webhook_duplicate_skipped',
        messageId,
      }),
    );
    logSpy.mockRestore();
  });

  it('skips duplicate nested deliveries', async () => {
    redis.set.mockResolvedValue(null);

    await expect(service.handleKapsoWebhook(nestedPayload as any, undefined)).resolves.toMatchObject({
      status: 'duplicate',
      messageId,
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(messageProcessor.process).not.toHaveBeenCalled();
  });

  it('skips duplicate flattened deliveries', async () => {
    redis.set.mockResolvedValue(null);

    await expect(
      service.handleKapsoWebhook({ message: { id: messageId, from: '573001234567' } } as any, undefined),
    ).resolves.toMatchObject({ status: 'duplicate', messageId });

    expect(queue.add).not.toHaveBeenCalled();
    expect(messageProcessor.process).not.toHaveBeenCalled();
  });

  it('does not enqueue if no idempotency key can be resolved', async () => {
    await expect(
      service.handleKapsoWebhook(
        {
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [{ from: '573001234567', text: { body: 'Hola' } }],
                  },
                },
              ],
            },
          ],
        } as any,
        undefined,
      ),
    ).resolves.toMatchObject({ status: 'ignored' });

    expect(redis.set).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(messageProcessor.process).not.toHaveBeenCalled();
  });

  it('ignores non-inbound webhook events like outbound delivery updates', async () => {
    await expect(
      service.handleKapsoWebhook(
        {
          message: {
            id: 'wamid.outbound_1',
            status: 'delivered',
          },
          conversation: {
            id: 'conv_1',
          },
          phone_number_id: '123',
        } as any,
        'status_evt_1',
      ),
    ).resolves.toMatchObject({ status: 'ignored' });

    expect(redis.set).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(messageProcessor.process).not.toHaveBeenCalled();
  });

  it('deletes Redis reservation and throws retryable 5xx if enqueue fails', async () => {
    redis.set.mockResolvedValue('OK');
    queue.add.mockRejectedValue(new Error('queue down'));

    await expect(
      service.handleKapsoWebhook(
        { message: { id: messageId, from: '573001234567' } } as any,
        undefined,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(redis.del).toHaveBeenCalledWith(`wh:msg:${messageId}`);
    expect(messageProcessor.process).not.toHaveBeenCalled();
  });

  it('captures owner review commands from the same webhook path before the dashboard exists', async () => {
    redis.set.mockResolvedValue('OK');
    queue.add.mockResolvedValue({ id: 'job_1' });
    ownerReviewService.handleOwnerCommand.mockResolvedValue(true);

    await expect(
      service.handleKapsoWebhook(
        {
          message: {
            id: messageId,
            from: '+573009998877',
            text: { body: 'SN8 APPROVE +573001234567 v2' },
          },
        } as any,
        undefined,
      ),
    ).resolves.toMatchObject({ status: 'owner-review-command', messageId });

    expect(ownerReviewService.handleOwnerCommand).toHaveBeenCalledWith({
      body: 'SN8 APPROVE +573001234567 v2',
      fromPhone: '+573009998877',
      messageId,
    });
    expect(queue.add).toHaveBeenCalledWith('process-message', {
      messageId,
      payload: {
        message: {
          id: messageId,
          from: '+573009998877',
          text: { body: 'SN8 APPROVE +573001234567 v2' },
        },
      },
    });
    expect(messageProcessor.process).toHaveBeenCalled();
  });

  it('does not treat customer messages that mimic commands as owner approvals', async () => {
    redis.set.mockResolvedValue('OK');
    queue.add.mockResolvedValue({ id: 'job_1' });
    ownerReviewService.handleOwnerCommand.mockResolvedValue(false);

    await expect(
      service.handleKapsoWebhook(
        {
          message: {
            id: messageId,
            from: '+573001234567',
            text: { body: 'SN8 APPROVE +573001234567 v2' },
          },
        } as any,
        undefined,
      ),
    ).resolves.toMatchObject({ status: 'enqueued', messageId });

    expect(ownerReviewService.handleOwnerCommand).toHaveBeenCalledWith({
      body: 'SN8 APPROVE +573001234567 v2',
      fromPhone: '+573001234567',
      messageId,
    });
    expect(messageProcessor.process).toHaveBeenCalled();
  });
});
