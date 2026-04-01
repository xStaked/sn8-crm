import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotePdfService } from './quote-pdf.service';

@Module({
  imports: [PrismaModule],
  providers: [QuotePdfService],
  exports: [QuotePdfService],
})
export class QuoteDocumentsModule {}
