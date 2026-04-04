import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ApplyOwnerAdjustmentsDto {
  @ApiProperty({ example: 3, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional({
    example: 9500000,
    description: 'Nuevo minimo comercial propuesto por el owner.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedMinAmount?: number;

  @ApiPropertyOptional({
    example: 12000000,
    description: 'Nuevo target comercial propuesto por el owner.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedTargetAmount?: number;

  @ApiPropertyOptional({
    example: 14500000,
    description: 'Nuevo maximo comercial propuesto por el owner.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedMaxAmount?: number;

  @ApiPropertyOptional({
    type: [String],
    example: [
      'Implementacion por fases para reducir riesgo inicial',
      'Sin integracion de ERP en la fase 1',
    ],
    description: 'Supuestos comerciales editados manualmente por el owner.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  assumptions?: string[];

  @ApiPropertyOptional({
    example: 'Ajuste para cerrar en este trimestre sin comprometer margen base.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
