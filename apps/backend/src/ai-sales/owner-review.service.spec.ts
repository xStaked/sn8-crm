import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OwnerReviewService } from './owner-review.service';

describe('OwnerReviewService', () => {
  let prisma: any;
  let messagingService: any;
  let config: ConfigService;
  let queue: any;
  let aiSalesService: any;
  let quotePdfService: any;
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
      sendDocument: jest.fn().mockResolvedValue('out_pdf_123'),
    };
    quotePdfService = {
      getOrCreateDraftPdf: jest.fn().mockResolvedValue({
        content: Buffer.from('fake-pdf'),
        fileName: 'cotizacion.pdf',
      }),
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
      quotePdfService,
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

  it('skips the legacy owner WhatsApp notification when AI_SALES_OWNER_PHONE is missing', async () => {
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'AI_SALES_OWNER_PHONE') {
        return undefined as never;
      }

      if (key === 'KAPSO_PHONE_NUMBER_ID') {
        return 'kapso-phone-id' as never;
      }

      return undefined as never;
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
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

    await expect(service.requestOwnerReview('draft_1')).resolves.toBeUndefined();

    expect(messagingService.sendText).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'owner_review_whatsapp_notification_skipped',
        quoteDraftId: 'draft_1',
        conversationId: '+573001234567',
        reason: 'missing_ai_sales_owner_phone',
      }),
    );
  });

  it('approves only the active draft version and records durable approval', async () => {
    prisma.quoteDraft.findFirst
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: 'draft_2',
        commercialBriefId: 'brief_1',
        conversationId: '+573001234567',
        version: 2,
        reviewStatus: 'approved',
        renderedQuote: 'Cotizacion aprobada lista para el cliente.',
        reviewEvents: [],
        commercialBrief: {
          id: 'brief_1',
          conversationId: '+573001234567',
          customerName: 'Acme',
          summary: 'Resumen',
        },
      });
    messagingService.sendText.mockResolvedValue('out_delivery_123');

    await service.approveDraftFromCrm({
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
          feedback: 'Approved by +573009998877 via CRM.',
        }),
      }),
    );
    expect(prisma.commercialBrief.update).toHaveBeenCalledWith({
      where: { id: 'brief_1' },
      data: { status: 'approved' },
    });

    // Customer delivery assertions
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '+573001234567',
      'Cotizacion aprobada lista para el cliente.',
      'kapso-phone-id',
    );
    expect(prisma.quoteDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_2' },
        data: {
          reviewStatus: 'delivered_to_customer',
          deliveredToCustomerAt: expect.any(Date),
        },
      }),
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toPhone: '+573001234567',
          body: 'Cotizacion aprobada lista para el cliente.',
          direction: 'outbound',
        }),
      }),
    );
  });

  it('does not mark delivered_to_customer when rendered quote body is empty', async () => {
    prisma.quoteDraft.findFirst
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: 'draft_2',
        commercialBriefId: 'brief_1',
        conversationId: '+573001234567',
        version: 2,
        reviewStatus: 'approved',
        renderedQuote: null,
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
        reviewerPhone: '+573009998877',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Should NOT have updated to delivered_to_customer
    const deliveredUpdateCall = (prisma.quoteDraft.update as jest.Mock).mock.calls.find(
      (call: any[]) => call[0]?.data?.reviewStatus === 'delivered_to_customer',
    );
    expect(deliveredUpdateCall).toBeUndefined();
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

  it('prepares customer delivery only after explicit approval exists', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_2',
      conversationId: '+573001234567',
      version: 2,
      reviewStatus: 'approved',
      renderedQuote: 'Cotizacion aprobada lista para envio.',
    });

    await expect(
      service.prepareApprovedCustomerDelivery('+573001234567'),
    ).resolves.toMatchObject({
      conversationId: '+573001234567',
      quoteDraftId: 'draft_2',
      version: 2,
      body: 'Cotizacion aprobada lista para envio.',
    });
  });

  it('records requested changes and enqueues a regeneration job', async () => {
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
    prisma.quoteReviewEvent.create.mockResolvedValue({
      id: 'evt_2',
      quoteDraftId: 'draft_2',
      conversationId: '+573001234567',
      iteration: 4,
      reviewStatus: 'changes_requested',
      feedback: 'Ajustar alcance y aclarar pricing. (via CRM)',
    });

    await service.requestChangesFromCrm({
      action: 'revise' as any,
      conversationId: '+573001234567',
      version: 2,
      reviewerPhone: '+573009998877',
      feedback: 'Ajustar alcance y aclarar pricing.',
    });

    expect(prisma.quoteDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_2' },
        data: expect.objectContaining({
          reviewStatus: 'changes_requested',
          ownerFeedbackSummary: 'Ajustar alcance y aclarar pricing.',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'process-owner-revision',
      expect.objectContaining({
        conversationId: '+573001234567',
        quoteDraftId: 'draft_2',
        reviewEventId: 'evt_2',
      }),
      expect.objectContaining({
        jobId: 'owner-revision:draft_2:evt_2',
      }),
    );
  });

  it('keeps WhatsApp-originated change requests tagged as WhatsApp commands', async () => {
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
    prisma.quoteReviewEvent.create.mockResolvedValue({
      id: 'evt_2',
      quoteDraftId: 'draft_2',
      conversationId: '+573001234567',
      iteration: 4,
      reviewStatus: 'changes_requested',
      feedback: 'Ajustar pricing. (via WhatsApp command)',
    });

    await service.requestChanges({
      action: 'revise' as any,
      conversationId: '+573001234567',
      version: 2,
      reviewerPhone: '+573009998877',
      feedback: 'Ajustar pricing.',
    });

    expect(prisma.quoteReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedback: 'Ajustar pricing. (via WhatsApp command)',
        }),
      }),
    );
  });

  it('regenerates a new draft version from owner feedback and re-notifies the owner', async () => {
    prisma.quoteDraft.findUnique
      .mockResolvedValueOnce({
        id: 'draft_2',
        commercialBriefId: 'brief_1',
        conversationId: '+573001234567',
        version: 2,
        templateVersion: '2026-04-03.commercial-template-v1',
        renderedQuote: 'Version original',
        reviewStatus: 'changes_requested',
        reviewEvents: [],
        commercialBrief: {
          id: 'brief_1',
          conversationId: '+573001234567',
          customerName: 'Acme',
          projectType: 'App B2B',
          businessProblem: 'Unificar ventas',
          desiredScope: 'MVP',
          budget: '10k-15k',
          urgency: 'alta',
          constraints: '2 meses',
          summary: 'Lead con urgencia alta y alcance confirmado.',
        },
      })
      .mockResolvedValueOnce({
        id: 'draft_3',
        conversationId: '+573001234567',
        version: 3,
        reviewStatus: 'pending_owner_review',
        draftPayload: { summary: 'Nueva version' },
        renderedQuote: 'Nueva version renderizada',
        commercialBrief: {
          id: 'brief_1',
          conversationId: '+573001234567',
          customerName: 'Acme',
          summary: 'Lead con urgencia alta y alcance confirmado.',
        },
      });
    prisma.quoteDraft.findFirst
      .mockResolvedValueOnce({
        id: 'draft_2',
        commercialBriefId: 'brief_1',
        conversationId: '+573001234567',
        version: 2,
        templateVersion: '2026-04-03.commercial-template-v1',
        renderedQuote: 'Version original',
        reviewStatus: 'changes_requested',
        reviewEvents: [],
        commercialBrief: {
          id: 'brief_1',
          conversationId: '+573001234567',
          customerName: 'Acme',
          projectType: 'App B2B',
          businessProblem: 'Unificar ventas',
          desiredScope: 'MVP',
          budget: '10k-15k',
          urgency: 'alta',
          constraints: '2 meses',
          summary: 'Lead con urgencia alta y alcance confirmado.',
        },
      })
      .mockResolvedValueOnce({
        id: 'draft_2',
        conversationId: '+573001234567',
        version: 2,
      });
    prisma.quoteReviewEvent.findUnique.mockResolvedValue({
      id: 'evt_2',
      quoteDraftId: 'draft_2',
      conversationId: '+573001234567',
      iteration: 4,
      reviewStatus: 'changes_requested',
      feedback: 'Ajustar alcance y aclarar pricing.',
    });
    prisma.message.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-03-19T00:00:00.000Z'),
        direction: 'inbound',
        body: 'Necesito una app B2B',
      },
    ]);
    aiSalesService.regenerateQuoteDraft.mockResolvedValue({
      summary: 'Version ajustada con pricing mas claro.',
      structuredDraft: {
        ownerReviewDraft: {
          title: 'Cotizacion ajustada',
        },
      },
      renderedQuote: 'Cotizacion ajustada',
      ownerReviewNotes: ['Se aclararon supuestos'],
      customerSafeStatus: 'Pendiente',
      model: 'deepseek-chat',
    });
    prisma.quoteDraft.create.mockResolvedValue({
      id: 'draft_3',
      commercialBriefId: 'brief_1',
      conversationId: '+573001234567',
      version: 3,
      reviewStatus: 'pending_owner_review',
      draftPayload: { summary: 'Nueva version' },
      renderedQuote: 'Nueva version renderizada',
      commercialBrief: {
        id: 'brief_1',
        conversationId: '+573001234567',
        customerName: 'Acme',
        summary: 'Lead con urgencia alta y alcance confirmado.',
      },
    });

    const result = await service.processRevisionJob({
      conversationId: '+573001234567',
      quoteDraftId: 'draft_2',
      reviewEventId: 'evt_2',
      requestedAt: '2026-03-19T00:00:00.000Z',
    });

    expect(aiSalesService.regenerateQuoteDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '+573001234567',
        ownerFeedback: 'Ajustar alcance y aclarar pricing.',
        previousDraft: 'Version original',
      }),
    );
    expect(prisma.quoteDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: '+573001234567',
          version: 3,
          origin: 'regenerated',
          ownerFeedbackSummary: 'Ajustar alcance y aclarar pricing.',
        }),
      }),
    );
    expect(prisma.quoteReviewEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_2' },
      data: { resolvedAt: expect.any(Date) },
    });
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '+573009998877',
      expect.stringContaining('SN8 APPROVE +573001234567 v3'),
      'kapso-phone-id',
    );
    expect(result).toMatchObject({
      id: 'draft_3',
      version: 3,
      conversationId: '+573001234567',
    });
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
