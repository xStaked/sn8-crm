import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OwnerReviewService } from './owner-review.service';

describe('OwnerReviewService', () => {
  let prisma: any;
  let messagingService: any;
  let config: ConfigService;
  let queue: any;
  let aiSalesService: any;
  let service: OwnerReviewService;

  beforeEach(() => {
    prisma = {
      quoteDraft: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      quoteReviewEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialBrief: {
        update: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
    };
    messagingService = {
      sendText: jest.fn().mockResolvedValue('out_123'),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'AI_SALES_OWNER_PHONE') {
          return '+573009998877';
        }

        if (key === 'KAPSO_PHONE_NUMBER_ID') {
          return 'kapso-phone-id';
        }

        return undefined;
      }),
    } as unknown as ConfigService;
    queue = {
      add: jest.fn(),
    };
    aiSalesService = {
      regenerateQuoteDraft: jest.fn(),
    };

    service = new OwnerReviewService(
      queue,
      prisma,
      messagingService,
      config,
      aiSalesService,
    );
  });

  it('sends an actionable owner review WhatsApp payload for the latest draft', async () => {
    prisma.quoteDraft.findUnique.mockResolvedValue({
      id: 'draft_1',
      conversationId: '+573001234567',
      version: 2,
      reviewStatus: 'pending_owner_review',
      draftPayload: { summary: 'Cotizacion preliminar para app B2B.' },
      renderedQuote: 'Alcance preliminar y supuestos.',
      commercialBrief: {
        id: 'brief_1',
        conversationId: '+573001234567',
        customerName: 'Acme',
        summary: 'Lead con urgencia alta y alcance confirmado.',
      },
    });

    await service.requestOwnerReview('draft_1');

    expect(messagingService.sendText).toHaveBeenCalledWith(
      '+573009998877',
      expect.stringContaining('SN8 APPROVE +573001234567 v2'),
      'kapso-phone-id',
    );
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '+573009998877',
      expect.stringContaining('SN8 REVISE +573001234567 v2 <comentarios>'),
      'kapso-phone-id',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toPhone: '+573009998877',
          rawPayload: expect.objectContaining({
            source: 'ai-sales-owner-review',
            conversationId: '+573001234567',
            version: 2,
          }),
        }),
      }),
    );
  });

  it('approves only the active draft version and records durable approval', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_2',
      commercialBriefId: 'brief_1',
      conversationId: '+573001234567',
      version: 2,
      reviewStatus: 'pending_owner_review',
      reviewEvents: [{ id: 'evt_1', iteration: 3 }],
      commercialBrief: {
        id: 'brief_1',
        conversationId: '+573001234567',
        customerName: 'Acme',
        summary: 'Resumen',
      },
    });

    await service.approveDraft({
      action: 'approve' as any,
      conversationId: '+573001234567',
      version: 2,
      reviewerPhone: '+573009998877',
    });

    expect(prisma.quoteDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_2' },
        data: expect.objectContaining({
          reviewStatus: 'approved',
          approvedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.quoteReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteDraftId: 'draft_2',
          iteration: 4,
          reviewStatus: 'approved',
        }),
      }),
    );
    expect(prisma.commercialBrief.update).toHaveBeenCalledWith({
      where: { id: 'brief_1' },
      data: { status: 'approved' },
    });
  });

  it('blocks customer delivery while the latest draft is still pending owner review', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_2',
      conversationId: '+573001234567',
      version: 2,
      reviewStatus: 'pending_owner_review',
    });

    await expect(
      service.assertLatestDraftApproved('+573001234567'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the owner command targets an outdated version', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_3',
      commercialBriefId: 'brief_1',
      conversationId: '+573001234567',
      version: 3,
      reviewStatus: 'pending_owner_review',
      reviewEvents: [],
      commercialBrief: {
        id: 'brief_1',
        conversationId: '+573001234567',
        customerName: 'Acme',
        summary: 'Resumen',
      },
    });

    await expect(
      service.approveDraft({
        action: 'approve' as any,
        conversationId: '+573001234567',
        version: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
