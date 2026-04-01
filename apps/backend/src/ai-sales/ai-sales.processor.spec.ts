import { AiSalesProcessor } from './ai-sales.processor';
import {
  AI_SALES_PROCESS_OWNER_REVISION_JOB,
  AI_SALES_PROCESS_QUALIFIED_JOB,
} from './dto/ai-sales-state.dto';

describe('AiSalesProcessor', () => {
  it('processes qualified-conversation jobs through the orchestrator', async () => {
    const orchestrator = {
      processQualifiedConversation: jest.fn().mockResolvedValue({
        processingStage: 'draft_ready_for_review',
        quoteDraftId: 'draft_1',
        missingFields: [],
      }),
    };
    const ownerReviewService = {
      processRevisionJob: jest.fn(),
    };
    const processor = new AiSalesProcessor(
      orchestrator as any,
      ownerReviewService as any,
    );

    await processor.process({
      id: 'job_1',
      name: AI_SALES_PROCESS_QUALIFIED_JOB,
      data: {
        conversationId: '+573001234567',
        triggeredBy: 'customer-message',
        requestedAt: '2026-03-19T00:00:00.000Z',
      },
    } as any);

    expect(orchestrator.processQualifiedConversation).toHaveBeenCalledWith(
      '+573001234567',
    );
    expect(ownerReviewService.processRevisionJob).not.toHaveBeenCalled();
  });

  it('processes owner revision jobs through the owner review service', async () => {
    const orchestrator = {
      processQualifiedConversation: jest.fn(),
    };
    const ownerReviewService = {
      processRevisionJob: jest.fn().mockResolvedValue({
        id: 'draft_2',
        conversationId: '+573001234567',
        version: 2,
      }),
    };
    const processor = new AiSalesProcessor(
      orchestrator as any,
      ownerReviewService as any,
    );

    await processor.process({
      id: 'job_2',
      name: AI_SALES_PROCESS_OWNER_REVISION_JOB,
      data: {
        conversationId: '+573001234567',
        quoteDraftId: 'draft_1',
        reviewEventId: 'evt_1',
        requestedAt: '2026-03-19T00:00:00.000Z',
      },
    } as any);

    expect(ownerReviewService.processRevisionJob).toHaveBeenCalledWith({
      conversationId: '+573001234567',
      quoteDraftId: 'draft_1',
      reviewEventId: 'evt_1',
      requestedAt: '2026-03-19T00:00:00.000Z',
    });
    expect(orchestrator.processQualifiedConversation).not.toHaveBeenCalled();
  });

  it('fails unsupported ai-sales jobs instead of acknowledging them', async () => {
    const processor = new AiSalesProcessor(
      {
        processQualifiedConversation: jest.fn(),
      } as any,
      {
        processRevisionJob: jest.fn(),
      } as any,
    );

    await expect(
      processor.process({
        id: 'job_3',
        name: 'unknown-job',
        data: {
          conversationId: '+573001234567',
        },
      } as any),
    ).rejects.toThrow('Unsupported ai-sales job "unknown-job".');
  });
});
