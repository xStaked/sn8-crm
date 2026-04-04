import { ApiProperty } from '@nestjs/swagger';

export class ConversationControlResponseDto {
  @ApiProperty({ example: '573001112233' })
  conversationId: string;

  @ApiProperty({
    example: 'HUMAN_HANDOFF',
    enum: ['GREETING', 'INFO_SERVICES', 'QUALIFYING', 'HUMAN_HANDOFF', 'AI_SALES'],
  })
  state: string;

  @ApiProperty({
    example: 'pending_resume',
    enum: ['ai_control', 'human_control', 'pending_resume'],
  })
  control: 'ai_control' | 'human_control' | 'pending_resume';

  @ApiProperty({
    example: '2026-04-04T17:20:00.000Z',
    format: 'date-time',
  })
  updatedAt: string;

  @ApiProperty({ example: 'owner@example.com' })
  updatedBy: string;
}
