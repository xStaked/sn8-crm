import { Module, forwardRef } from '@nestjs/common';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BotConversationRepository } from './bot-conversation.repository';
import { BotConversationService } from './bot-conversation.service';
import { HumanHandoffService } from './human-handoff.service';
import { IntentClassifierService } from './intent-classifier.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => MessagingModule),
    forwardRef(() => AiSalesModule),
  ],
  providers: [
    BotConversationRepository,
    BotConversationService,
    HumanHandoffService,
    IntentClassifierService,
  ],
  exports: [
    BotConversationRepository,
    BotConversationService,
    HumanHandoffService,
    IntentClassifierService,
  ],
})
export class BotConversationModule {}
