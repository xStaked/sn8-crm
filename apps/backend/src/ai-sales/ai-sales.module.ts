import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.interface';
import { DeepSeekClient } from './deepseek/deepseek.client';
import { AiSalesService } from './ai-sales.service';

@Module({
  providers: [
    DeepSeekClient,
    AiSalesService,
    {
      provide: AI_PROVIDER,
      useExisting: DeepSeekClient,
    },
  ],
  exports: [AiSalesService, AI_PROVIDER],
})
export class AiSalesModule {}
