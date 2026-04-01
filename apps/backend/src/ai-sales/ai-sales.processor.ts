import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import { OwnerReviewService } from './owner-review.service';
import {
  AI_SALES_PROCESS_QUALIFIED_JOB,
  AI_SALES_PROCESS_OWNER_REVISION_JOB,
  AI_SALES_QUEUE,
  ProcessQualifiedConversationJob,
  ProcessOwnerRevisionJob,
} from './dto/ai-sales-state.dto';

@Processor(AI_SALES_QUEUE)
export class AiSalesProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSalesProcessor.name);

  constructor(
    private readonly orchestrator: AiSalesOrchestrator,
    private readonly ownerReviewService: OwnerReviewService,
  ) {
    super();
  }

  async process(
    job: Job<ProcessQualifiedConversationJob | ProcessOwnerRevisionJob>,
  ): Promise<void> {
    try {
      switch (job.name) {
        case AI_SALES_PROCESS_QUALIFIED_JOB:
          await this.processQualifiedConversationJob(
            job as Job<ProcessQualifiedConversationJob>,
          );
          return;
        case AI_SALES_PROCESS_OWNER_REVISION_JOB:
          await this.processOwnerRevisionJob(job as Job<ProcessOwnerRevisionJob>);
          return;
        default:
          throw new Error(`Unsupported ai-sales job "${job.name}".`);
      }
    } catch (error) {
      this.logger.error({
        event: 'ai_sales_job_failed',
        jobId: job.id ?? null,
        jobName: job.name,
        conversationId: job.data?.conversationId?.trim() ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async processQualifiedConversationJob(
    job: Job<ProcessQualifiedConversationJob>,
  ): Promise<void> {
    const conversationId = job.data?.conversationId?.trim();
    if (!conversationId) {
      throw new Error('AI sales job is missing conversationId.');
    }

    this.logger.log({
      event: 'ai_sales_job_started',
      jobId: job.id ?? null,
      conversationId,
      triggeredBy: job.data.triggeredBy,
    });

    const result = await this.orchestrator.processQualifiedConversation(conversationId);

    this.logger.log({
      event: 'ai_sales_job_completed',
      jobId: job.id ?? null,
      conversationId,
      processingStage: result.processingStage,
      quoteDraftId: result.quoteDraftId ?? null,
      missingFields: result.missingFields,
    });
  }

  private async processOwnerRevisionJob(
    job: Job<ProcessOwnerRevisionJob>,
  ): Promise<void> {
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
