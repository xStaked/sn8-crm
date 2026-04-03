import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export enum QuoteOutcomeStatusDto {
  WON = 'won',
  LOST = 'lost',
  PENDING = 'pending',
}

export class RecordQuoteOutcomeDto {
  @ApiProperty({ example: '+573001112233' })
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @ApiPropertyOptional({ example: 'cma_quote_draft_123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  quoteDraftId?: string;

  @ApiPropertyOptional({
    example: 'cma_estimate_snapshot_456',
    description: 'Si existe snapshot previo, se reutiliza para registrar/actualizar outcome.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  quoteEstimateSnapshotId?: string;

  @ApiProperty({ enum: QuoteOutcomeStatusDto, example: QuoteOutcomeStatusDto.WON })
  @IsEnum(QuoteOutcomeStatusDto)
  outcomeStatus: QuoteOutcomeStatusDto;

  @ApiPropertyOptional({ example: 18500000, description: 'Obligatorio para outcomes won.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  finalAmount?: number;

  @ApiPropertyOptional({ example: 15000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estimatedMinAmount?: number;

  @ApiPropertyOptional({ example: 18000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estimatedTargetAmount?: number;

  @ApiPropertyOptional({ example: 22000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  estimatedMaxAmount?: number;

  @ApiPropertyOptional({ example: 'COP', default: 'COP' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-04-03T18:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @ApiPropertyOptional({ example: 'Cliente aprobó sin cambios de alcance.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
