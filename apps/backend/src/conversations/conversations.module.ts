import { Module, forwardRef } from '@nestjs/common';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { AuthModule } from '../auth/auth.module';
import { BotConversationModule } from '../bot-conversation/bot-conversation.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuoteDocumentsModule } from '../quote-documents/quote-documents.module';
import { SaasModule } from '../saas/saas.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    QuoteDocumentsModule,
    SaasModule,
    forwardRef(() => BotConversationModule),
    forwardRef(() => MessagingModule),
    forwardRef(() => AiSalesModule),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
