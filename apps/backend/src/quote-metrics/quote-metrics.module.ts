import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuoteMetricsController } from './quote-metrics.controller';
import { QuoteMetricsService } from './quote-metrics.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [QuoteMetricsController],
  providers: [QuoteMetricsService],
  exports: [QuoteMetricsService],
})
export class QuoteMetricsModule {}
