import { Module, forwardRef } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BotConversationRepository } from './bot-conversation.repository';
import { BotConversationService } from './bot-conversation.service';

@Module({
  imports: [PrismaModule, forwardRef(() => MessagingModule)],
  providers: [BotConversationRepository, BotConversationService],
  exports: [BotConversationRepository, BotConversationService],
})
export class BotConversationModule {}
