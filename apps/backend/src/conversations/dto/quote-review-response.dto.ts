import { ApiProperty } from '@nestjs/swagger';

export class PendingQuoteSummaryDto {
  @ApiProperty({ example: '573001112233' })
  conversationId: string;

  @ApiProperty({ example: 'cma_quote_draft_123' })
  quoteDraftId: string;

  @ApiProperty({ example: 3 })
  version: number;

  @ApiProperty({
    example: 'pending_owner_review',
    enum: [
      'pending_owner_review',
      'ready_for_recheck',
      'changes_requested',
      'approved',
      'delivered_to_customer',
    ],
  })
  reviewStatus: string;
}

export class ConversationQuoteReviewBriefDto {
  @ApiProperty({ example: 'ACME SAS', nullable: true })
  customerName: string | null;

  @ApiProperty({
    example: 'Landing transaccional con CRM interno y onboarding automatizado.',
    nullable: true,
  })
  summary: string | null;

  @ApiProperty({ example: 'CRM + automatizacion', nullable: true })
  projectType: string | null;

  @ApiProperty({ example: 'USD 5k-8k', nullable: true })
  budget: string | null;

  @ApiProperty({ example: 'Esta semana', nullable: true })
  urgency: string | null;
}

export class ConversationQuoteReviewDto {
  @ApiProperty({ example: '573001112233' })
  conversationId: string;

  @ApiProperty({ example: 'cma_quote_draft_123' })
  quoteDraftId: string;

  @ApiProperty({ example: 3 })
  version: number;

  @ApiProperty({
    example: 'ready_for_recheck',
    enum: [
      'pending_owner_review',
      'ready_for_recheck',
      'changes_requested',
      'approved',
      'delivered_to_customer',
    ],
  })
  reviewStatus: string;

  @ApiProperty({
    example: 'Resumen ejecutivo\n\nAlcance...\n\nInversion...',
    nullable: true,
  })
  renderedQuote: string | null;

  @ApiProperty({
    example: 'Cotizacion lista para aprobacion final del socio.',
    nullable: true,
  })
  draftSummary: string | null;

  @ApiProperty({
    example: 'Ajustar alcance del módulo comercial.',
    nullable: true,
  })
  ownerFeedbackSummary: string | null;

  @ApiProperty({
    example: '2026-04-01T19:00:00.000Z',
    format: 'date-time',
    nullable: true,
  })
  approvedAt: string | null;

  @ApiProperty({
    example: '2026-04-01T19:05:00.000Z',
    format: 'date-time',
    nullable: true,
  })
  deliveredToCustomerAt: string | null;

  @ApiProperty({ type: ConversationQuoteReviewBriefDto })
  commercialBrief: ConversationQuoteReviewBriefDto;
}
