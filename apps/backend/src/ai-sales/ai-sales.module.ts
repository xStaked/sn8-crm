import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AI_PROVIDER } from './ai-provider.interface';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import { AiSalesProcessor } from './ai-sales.processor';
import { DeepSeekClient } from './deepseek/deepseek.client';
import { AI_SALES_QUEUE } from './dto/ai-sales-state.dto';
import { AiSalesService } from './ai-sales.service';
import { ConversationFlowService } from './conversation-flow.service';
import { OwnerReviewService } from './owner-review.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => MessagingModule),
    BullModule.registerQueue({ name: AI_SALES_QUEUE }),
  ],
  providers: [
    DeepSeekClient,
    AiSalesService,
    AiSalesOrchestrator,
    ConversationFlowService,
    OwnerReviewService,
    AiSalesProcessor,
    {
      provide: AI_PROVIDER,
      useExisting: DeepSeekClient,
    },
  ],
  exports: [
    AiSalesService,
    AiSalesOrchestrator,
    ConversationFlowService,
    OwnerReviewService,
    AI_PROVIDER,
  ],
})
export class AiSalesModule {}
