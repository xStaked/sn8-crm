import { Module, forwardRef } from '@nestjs/common';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { BullModule } from '@nestjs/bullmq';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingService } from './messaging.service';
import { MessageProcessor } from './processors/message.processor';

@Module({
  imports: [
    forwardRef(() => AiSalesModule),
    ChannelsModule,
    PrismaModule,
    BullModule.registerQueue({ name: 'incoming-messages' }),
  ],
  providers: [MessagingService, MessageProcessor],
  exports: [MessagingService, MessageProcessor, BullModule],
})
export class MessagingModule {}
