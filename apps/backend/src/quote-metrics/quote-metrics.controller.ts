import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListQuoteMetricsDto } from './dto/list-quote-metrics.dto';
import {
  QuoteMetricsSummaryDto,
  QuoteOutcomeCaptureResultDto,
} from './dto/quote-metrics-summary.dto';
import { RecordQuoteOutcomeDto } from './dto/record-quote-outcome.dto';
import { QuoteMetricsService } from './quote-metrics.service';

@ApiTags('Quote Metrics')
@ApiCookieAuth('access_token')
@ApiBearerAuth('access_token_bearer')
@ApiUnauthorizedResponse({ description: 'La cookie de sesion es invalida o no existe.' })
@Controller('quote-metrics')
@UseGuards(JwtAuthGuard)
export class QuoteMetricsController {
  constructor(private readonly quoteMetricsService: QuoteMetricsService) {}

  @ApiOperation({
    summary: 'Registrar outcome comercial real para feedback loop (won/lost/pending)',
  })
  @ApiOkResponse({
    description: 'Outcome persistido correctamente y listo para analítica de precisión.',
    type: QuoteOutcomeCaptureResultDto,
  })
  @Post('outcomes')
  recordOutcome(@Body() dto: RecordQuoteOutcomeDto): Promise<QuoteOutcomeCaptureResultDto> {
    return this.quoteMetricsService.recordOutcome(dto);
  }

  @ApiOperation({
    summary: 'Consultar métricas de precisión comercial y calibración en ventana temporal',
  })
  @ApiOkResponse({
    description:
      'KPIs mínimos para pricing: delta estimado-real, turnaround, approval/rework y guía de recalibración.',
    type: QuoteMetricsSummaryDto,
  })
  @Get('summary')
  getSummary(@Query() query: ListQuoteMetricsDto): Promise<QuoteMetricsSummaryDto> {
    return this.quoteMetricsService.getSummary(query);
  }
}
