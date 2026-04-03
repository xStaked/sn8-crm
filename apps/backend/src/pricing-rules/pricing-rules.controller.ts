import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { ListPricingRulesDto } from './dto/list-pricing-rules.dto';
import { PricingRuleDto } from './dto/pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { PricingRulesService } from './pricing-rules.service';

@ApiTags('Pricing Rules')
@ApiCookieAuth('access_token')
@ApiBearerAuth('access_token_bearer')
@ApiUnauthorizedResponse({ description: 'La cookie de sesion es invalida o no existe.' })
@Controller('pricing-rules')
@UseGuards(JwtAuthGuard)
export class PricingRulesController {
  constructor(private readonly pricingRulesService: PricingRulesService) {}

  @ApiOperation({ summary: 'Listar reglas comerciales de pricing' })
  @ApiOkResponse({ type: PricingRuleDto, isArray: true })
  @Get()
  listRules(@Query() query: ListPricingRulesDto): Promise<PricingRuleDto[]> {
    return this.pricingRulesService.listRules(query);
  }

  @ApiOperation({ summary: 'Obtener una regla comercial puntual' })
  @ApiParam({ name: 'ruleId', example: 'cma_pricing_rule_123' })
  @ApiOkResponse({ type: PricingRuleDto })
  @Get(':ruleId')
  getRule(@Param('ruleId') ruleId: string): Promise<PricingRuleDto> {
    return this.pricingRulesService.getRule(ruleId);
  }

  @ApiOperation({ summary: 'Crear una regla comercial (nueva version por llave comercial)' })
  @ApiOkResponse({ type: PricingRuleDto })
  @Post()
  createRule(@Body() dto: CreatePricingRuleDto): Promise<PricingRuleDto> {
    return this.pricingRulesService.createRule(dto);
  }

  @ApiOperation({ summary: 'Editar una regla creando una nueva version' })
  @ApiParam({ name: 'ruleId', example: 'cma_pricing_rule_123' })
  @ApiOkResponse({ type: PricingRuleDto })
  @Patch(':ruleId')
  updateRule(
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdatePricingRuleDto,
  ): Promise<PricingRuleDto> {
    return this.pricingRulesService.updateRule(ruleId, dto);
  }

  @ApiOperation({ summary: 'Activar una version existente de regla' })
  @ApiParam({ name: 'ruleId', example: 'cma_pricing_rule_123' })
  @ApiOkResponse({ type: PricingRuleDto })
  @Post(':ruleId/activate')
  activateRule(@Param('ruleId') ruleId: string): Promise<PricingRuleDto> {
    return this.pricingRulesService.activateRule(ruleId);
  }

  @ApiOperation({ summary: 'Archivar una regla (soft delete)' })
  @ApiParam({ name: 'ruleId', example: 'cma_pricing_rule_123' })
  @ApiNoContentResponse({ description: 'Regla archivada correctamente.' })
  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveRule(@Param('ruleId') ruleId: string): Promise<void> {
    await this.pricingRulesService.archiveRule(ruleId);
  }
}
