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

export class ConversationQuoteReviewPdfDto {
  @ApiProperty({ example: true })
  available: boolean;

  @ApiProperty({ example: 'cotizacion-sn8-v3.pdf', nullable: true })
  fileName: string | null;

  @ApiProperty({
    example: '2026-04-01T19:00:00.000Z',
    format: 'date-time',
    nullable: true,
  })
  generatedAt: string | null;

  @ApiProperty({ example: 182304, nullable: true })
  sizeBytes: number | null;

  @ApiProperty({ example: 3 })
  version: number;
}

export class ConversationQuotePricingRuleDto {
  @ApiProperty({ nullable: true, example: 'cma_pricing_rule_123' })
  id: string | null;

  @ApiProperty({ nullable: true, example: 4 })
  version: number | null;

  @ApiProperty({ nullable: true, example: 'crm' })
  category: string | null;

  @ApiProperty({ nullable: true, example: 'medium' })
  complexity: string | null;

  @ApiProperty({ nullable: true, example: 'erp' })
  integrationType: string | null;
}

export class ConversationQuoteRangeDto {
  @ApiProperty({ example: 9500000 })
  min: number;

  @ApiProperty({ example: 12000000 })
  target: number;

  @ApiProperty({ example: 15000000 })
  max: number;
}

export class ConversationQuoteOwnerAdjustmentDto {
  @ApiProperty({
    example: '2026-04-04T00:00:00.000Z',
    format: 'date-time',
  })
  adjustedAt: string;

  @ApiProperty({ example: 'socio@sn8labs.com' })
  adjustedBy: string;

  @ApiProperty({ type: ConversationQuoteRangeDto })
  previousRange: ConversationQuoteRangeDto;

  @ApiProperty({ type: ConversationQuoteRangeDto })
  adjustedRange: ConversationQuoteRangeDto;

  @ApiProperty({
    example: ['Se mantiene el alcance original de CRM', 'El onboarding se cotiza en una fase aparte'],
    type: [String],
  })
  assumptions: string[];

  @ApiProperty({
    nullable: true,
    example: 'Reducir target para cerrar esta semana sin perder margen minimo.',
  })
  reason: string | null;
}

export class ConversationQuoteReviewDto {
  @ApiProperty({ example: '573001112233' })
  conversationId: string;

  @ApiProperty({ example: 'cma_quote_draft_123', nullable: true })
  quoteDraftId: string | null;

  @ApiProperty({ example: 3, nullable: true })
  version: number | null;

  @ApiProperty({
    example: 'ready_for_recheck',
    enum: [
      'pending_owner_review',
      'ready_for_recheck',
      'changes_requested',
      'approved',
      'delivered_to_customer',
    ],
    nullable: true,
  })
  reviewStatus: string | null;

  @ApiProperty({
    example: 'quote_draft_ready',
    enum: [
      'idle',
      'brief_collecting',
      'brief_complete',
      'quote_draft_ready',
      'quote_sent',
      'quote_archived',
    ],
  })
  lifecycleState: string;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: {
      action: 'create_draft',
      message:
        'No hay un borrador activo para revisar. Vuelve a generar la cotización desde CRM.',
    },
  })
  recovery: Record<string, unknown> | null;

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

  @ApiProperty({ type: ConversationQuoteReviewPdfDto })
  pdf: ConversationQuoteReviewPdfDto;

  @ApiProperty({ type: ConversationQuotePricingRuleDto })
  pricingRule: ConversationQuotePricingRuleDto;

  @ApiProperty({ nullable: true, example: 68.5 })
  complexityScore: number | null;

  @ApiProperty({ nullable: true, example: 74 })
  confidence: number | null;

  @ApiProperty({ nullable: true, example: 4 })
  ruleVersionUsed: number | null;

  @ApiProperty({ nullable: true, example: 9500000 })
  estimatedMinAmount: number | null;

  @ApiProperty({ nullable: true, example: 12000000 })
  estimatedTargetAmount: number | null;

  @ApiProperty({ nullable: true, example: 14500000 })
  estimatedMaxAmount: number | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: {
      baseAmount: 8000000,
      complexityAmount: 1350000,
      integrationsAmount: 640000,
      urgencyAmount: 360000,
      riskAmount: 700000,
      totalAdjustmentAmount: 3050000,
    },
  })
  pricingBreakdown: Record<string, unknown> | null;

  @ApiProperty({
    type: ConversationQuoteOwnerAdjustmentDto,
    isArray: true,
  })
  ownerAdjustments: ConversationQuoteOwnerAdjustmentDto[];
}
