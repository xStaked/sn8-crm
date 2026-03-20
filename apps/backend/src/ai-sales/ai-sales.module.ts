import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    ConversationsModule,
    MessagingModule,
    BullModule.registerQueue({ name: AI_SALES_QUEUE }),
  ],
  providers: [
    DeepSeekClient,
    AiSalesService,
    AiSalesOrchestrator,
    AiSalesProcessor,
    {
      provide: AI_PROVIDER,
      useExisting: DeepSeekClient,
    },
  ],
  exports: [AiSalesService, AiSalesOrchestrator, AI_PROVIDER],
})
export class AiSalesModule {}
