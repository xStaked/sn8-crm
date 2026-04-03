import { ApiProperty } from '@nestjs/swagger';

export class PricingRuleDto {
  @ApiProperty({ example: 'cma_pricing_rule_123' })
  id: string;

  @ApiProperty({ example: 'Regla CRM base' })
  name: string;

  @ApiProperty({ example: 'crm', description: 'Categoria comercial de la regla.' })
  category: string;

  @ApiProperty({ example: 'medium', description: 'Complejidad comercial.' })
  complexity: string;

  @ApiProperty({ example: 'erp', description: 'Tipo de integracion principal.' })
  integrationType: string;

  @ApiProperty({ example: 3, description: 'Version secuencial de la regla.' })
  version: number;

  @ApiProperty({ example: 'COP' })
  currency: string;

  @ApiProperty({ example: '15.00' })
  minMarginPct: string;

  @ApiProperty({ example: '28.00' })
  targetMarginPct: string;

  @ApiProperty({ example: '40.00' })
  maxMarginPct: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ nullable: true, example: 'Regla para CRM en PYMEs con ERP.' })
  description: string | null;

  @ApiProperty({ nullable: true, example: '2026-04-03T23:00:00.000Z' })
  archivedAt: string | null;

  @ApiProperty({ example: '2026-04-03T22:50:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-04-03T22:50:00.000Z' })
  updatedAt: string;
}
