import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SaasService } from './saas.service';

@Module({
  imports: [PrismaModule],
  providers: [SaasService],
  exports: [SaasService],
})
export class SaasModule {}
