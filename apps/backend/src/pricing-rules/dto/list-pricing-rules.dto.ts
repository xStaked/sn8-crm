import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
}

export class ListPricingRulesDto {
  @ApiPropertyOptional({ example: 'crm' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'medium' })
  @IsOptional()
  @IsString()
  complexity?: string;

  @ApiPropertyOptional({ example: 'erp' })
  @IsOptional()
  @IsString()
  integrationType?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Si es true incluye reglas archivadas/inactivas.',
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeInactive?: boolean;
}
