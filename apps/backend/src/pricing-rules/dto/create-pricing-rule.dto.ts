import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePricingRuleDto {
  @ApiProperty({ example: 'Regla CRM base' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'crm' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'medium' })
  @IsString()
  @IsNotEmpty()
  complexity: string;

  @ApiProperty({ example: 'erp' })
  @IsString()
  @IsNotEmpty()
  integrationType: string;

  @ApiPropertyOptional({ example: 'Regla para CRM en PYMEs con ERP.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'COP', default: 'COP' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @ApiProperty({ example: 15, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  minMarginPct: number;

  @ApiProperty({ example: 28, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  targetMarginPct: number;

  @ApiProperty({ example: 40, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxMarginPct: number;

  @ApiPropertyOptional({
    description: 'Pesos de scoring para factores comerciales.',
    example: { timeline: 0.3, complexity: 0.5, integrations: 0.2 },
  })
  @IsOptional()
  @IsObject()
  scoreWeights?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Pesos de confianza para la estimacion.',
    example: { transcriptQuality: 0.5, scopeClarity: 0.5 },
  })
  @IsOptional()
  @IsObject()
  confidenceWeights?: Record<string, number>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
