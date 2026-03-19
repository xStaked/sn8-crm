import { Module } from '@nestjs/common';
import { ChannelAdapter } from './channel.adapter';
import { KapsoAdapter } from './kapso/kapso.adapter';
import { KapsoClient } from './kapso/kapso.client';

@Module({
  providers: [
    KapsoClient,
    {
      provide: ChannelAdapter,
      useClass: KapsoAdapter,
    },
  ],
  exports: [ChannelAdapter],
})
export class ChannelsModule {}

