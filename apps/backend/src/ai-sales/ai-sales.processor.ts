import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import {
  AI_SALES_PROCESS_QUALIFIED_JOB,
  AI_SALES_QUEUE,
  ProcessQualifiedConversationJob,
} from './dto/ai-sales-state.dto';

@Processor(AI_SALES_QUEUE)
export class AiSalesProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSalesProcessor.name);

  constructor(private readonly orchestrator: AiSalesOrchestrator) {
    super();
  }

  async process(job: Job<ProcessQualifiedConversationJob>): Promise<void> {
    if (job.name !== AI_SALES_PROCESS_QUALIFIED_JOB) {
      this.logger.warn({
        event: 'ai_sales_job_ignored',
        jobId: job.id ?? null,
        jobName: job.name,
      });
      return;
    }

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
}
