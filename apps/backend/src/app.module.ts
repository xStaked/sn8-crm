import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiSalesModule } from './ai-sales/ai-sales.module';
import { AuthModule } from './auth/auth.module';
import { BotConversationModule } from './bot-conversation/bot-conversation.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagingModule } from './messaging/messaging.module';
import { PricingRulesModule } from './pricing-rules/pricing-rules.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuoteMetricsModule } from './quote-metrics/quote-metrics.module';
import { QuoteDocumentsModule } from './quote-documents/quote-documents.module';
import { RedisModule } from './redis/redis.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    PricingRulesModule,
    AiSalesModule,
    BotConversationModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const username = config.get<string>('REDIS_USERNAME');
        const password = config.get<string>('REDIS_PASSWORD');

        return {
          connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
            ...(username ? { username } : {}),
            ...(password ? { password } : {}),
          },
        };
      },
      inject: [ConfigService],
    }),
    MessagingModule,
    QuoteDocumentsModule,
    QuoteMetricsModule,
    ConversationsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
