import { ApiProperty } from '@nestjs/swagger';

export class ConversationSummaryDto {
  @ApiProperty({ example: '573001112233' })
  id: string;

  @ApiProperty({ example: '573001112233' })
  contactName: string;

  @ApiProperty({ example: 'te respondo' })
  lastMessage: string;

  @ApiProperty({
    example: '2026-03-18T13:00:00.000Z',
    format: 'date-time',
  })
  lastMessageAt: string;

  @ApiProperty({ example: 0 })
  unreadCount: number;
}

export class ConversationMessageDto {
  @ApiProperty({ example: 'msg_outbound' })
  id: string;

  @ApiProperty({ example: '573001112233' })
  conversationId: string;

  @ApiProperty({ example: 'outbound', enum: ['inbound', 'outbound'] })
  direction: 'inbound' | 'outbound';

  @ApiProperty({ example: 'te respondo', nullable: true })
  body: string | null;

  @ApiProperty({
    example: '2026-03-18T13:00:00.000Z',
    format: 'date-time',
  })
  createdAt: string;
}
