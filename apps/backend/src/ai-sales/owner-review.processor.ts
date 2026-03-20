import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { OwnerReviewService } from './owner-review.service';
import {
  AI_SALES_PROCESS_OWNER_REVISION_JOB,
  AI_SALES_QUEUE,
  ProcessOwnerRevisionJob,
} from './dto/ai-sales-state.dto';

@Processor(AI_SALES_QUEUE)
export class OwnerReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(OwnerReviewProcessor.name);

  constructor(private readonly ownerReviewService: OwnerReviewService) {
    super();
  }

  async process(job: Job<ProcessOwnerRevisionJob>): Promise<void> {
    if (job.name !== AI_SALES_PROCESS_OWNER_REVISION_JOB) {
      return;
    }

    const result = await this.ownerReviewService.processRevisionJob(job.data);

    this.logger.log({
      event: 'owner_review_revision_completed',
      jobId: job.id ?? null,
      conversationId: result.conversationId,
      quoteDraftId: result.id,
      version: result.version,
    });
  }
}
