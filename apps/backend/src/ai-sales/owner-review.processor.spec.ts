import { OwnerReviewProcessor } from './owner-review.processor';
import { AI_SALES_PROCESS_OWNER_REVISION_JOB } from './dto/ai-sales-state.dto';

describe('OwnerReviewProcessor', () => {
  it('processes owner revision jobs through the owner review service', async () => {
    const ownerReviewService = {
      processRevisionJob: jest.fn().mockResolvedValue({
        id: 'draft_2',
        conversationId: '+573001234567',
        version: 2,
      }),
    };
    const processor = new OwnerReviewProcessor(ownerReviewService as any);

    await processor.process({
      id: 'job_1',
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
  });

  it('ignores unrelated ai-sales jobs', async () => {
    const ownerReviewService = {
      processRevisionJob: jest.fn(),
    };
    const processor = new OwnerReviewProcessor(ownerReviewService as any);

    await processor.process({
      id: 'job_2',
      name: 'process-qualified-conversation',
      data: {},
    } as any);

    expect(ownerReviewService.processRevisionJob).not.toHaveBeenCalled();
  });
});
