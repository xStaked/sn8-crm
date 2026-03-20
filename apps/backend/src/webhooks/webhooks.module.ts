import { Module } from '@nestjs/common';
import { AiSalesModule } from '../ai-sales/ai-sales.module';
import { MessagingModule } from '../messaging/messaging.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [MessagingModule, AiSalesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
