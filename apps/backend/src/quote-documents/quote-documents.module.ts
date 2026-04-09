import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotePdfAccessLinkService } from './quote-pdf-access-link.service';
import { QuotePdfService } from './quote-pdf.service';

@Module({
  imports: [PrismaModule],
  providers: [QuotePdfService, QuotePdfAccessLinkService],
  exports: [QuotePdfService, QuotePdfAccessLinkService],
})
export class QuoteDocumentsModule {}
