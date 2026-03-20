import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingService } from './messaging.service';
import { MessageProcessor } from './processors/message.processor';

@Module({
  imports: [
    ChannelsModule,
    PrismaModule,
    BullModule.registerQueue({ name: 'incoming-messages' }),
  ],
  providers: [MessagingService, MessageProcessor],
  exports: [MessagingService, MessageProcessor, BullModule],
})
export class MessagingModule {}
