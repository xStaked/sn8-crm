import { ApiProperty } from '@nestjs/swagger';

export class QuoteMetricsWindowDto {
  @ApiProperty({ example: '2026-03-04T00:00:00.000Z' })
  from: string;

  @ApiProperty({ example: '2026-04-03T23:59:59.999Z' })
  to: string;
}

export class QuoteOutcomeCaptureResultDto {
  @ApiProperty({ example: 'cma_quote_outcome_123' })
  outcomeId: string;

  @ApiProperty({ example: 'cma_estimate_snapshot_456' })
  quoteEstimateSnapshotId: string;

  @ApiProperty({ example: 'won' })
  outcomeStatus: string;

  @ApiProperty({ example: 18500000 })
  finalAmount: number;

  @ApiProperty({ example: 18000000 })
  estimatedTargetAmount: number;

  @ApiProperty({ example: 500000 })
  deltaAmount: number;

  @ApiProperty({ example: 2.78 })
  deltaPct: number;

  @ApiProperty({ example: '2026-04-03T18:30:00.000Z' })
  closedAt: string;
}

export class QuoteMonthlyRecalibrationDto {
  @ApiProperty({ example: true })
  recommended: boolean;

  @ApiProperty({ example: 'Se detectó drift >5% en MAE porcentual.' })
  reason: string;

  @ApiProperty({
    example: [
      'Exportar cierres won/lost del mes anterior.',
      'Comparar MAE por categoria-complejidad-integracion.',
      'Crear nueva version de reglas con ajustes de margen.',
    ],
  })
  steps: string[];
}

export class QuoteMetricsSummaryDto {
  @ApiProperty({ type: QuoteMetricsWindowDto })
  window: QuoteMetricsWindowDto;

  @ApiProperty({ example: 18 })
  totalOutcomes: number;

  @ApiProperty({ example: 9 })
  wonOutcomes: number;

  @ApiProperty({ example: 6 })
  lostOutcomes: number;

  @ApiProperty({ example: 3 })
  pendingOutcomes: number;

  @ApiProperty({ example: 60 })
  approvalRatePct: number;

  @ApiProperty({ example: 40 })
  reworkRatePct: number;

  @ApiProperty({ example: 19.4 })
  avgQuoteTurnaroundHours: number;

  @ApiProperty({ example: 4.92 })
  meanAbsoluteErrorPct: number;

  @ApiProperty({ example: -380000 })
  avgDeltaAmount: number;

  @ApiProperty({ type: QuoteMonthlyRecalibrationDto })
  monthlyRecalibration: QuoteMonthlyRecalibrationDto;
}
