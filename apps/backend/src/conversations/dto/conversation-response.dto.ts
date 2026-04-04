import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PendingQuoteSummaryDto } from './quote-review-response.dto';

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

  @ApiPropertyOptional({
    type: PendingQuoteSummaryDto,
    nullable: true,
    description:
      'Resumen aditivo del draft de cotizacion que sigue pendiente de revision en CRM.',
  })
  pendingQuote: PendingQuoteSummaryDto | null;

  @ApiProperty({
    description:
      'Estado/control actual de la conversacion para enrutar entre IA y takeover humano en CRM.',
    example: {
      state: 'HUMAN_HANDOFF',
      control: 'pending_resume',
      updatedAt: '2026-04-04T17:20:00.000Z',
      updatedBy: 'owner@example.com',
    },
  })
  conversationControl: {
    state: string;
    control: 'ai_control' | 'human_control' | 'pending_resume';
    updatedAt: string;
    updatedBy: string;
  };
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
