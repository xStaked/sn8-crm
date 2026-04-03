import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ListQuoteMetricsDto {
  @ApiPropertyOptional({
    example: '2026-03-01T00:00:00.000Z',
    description: 'Inicio de ventana de analítica (UTC). Por defecto: hoy - 30 días.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    example: '2026-03-31T23:59:59.999Z',
    description: 'Fin de ventana de analítica (UTC). Por defecto: now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
