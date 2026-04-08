import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApplyOwnerAdjustmentsDto } from './dto/apply-owner-adjustments.dto';
import { ApproveQuoteDto } from './dto/approve-quote.dto';
import {
  ConversationMessageDto,
  ConversationSummaryDto,
} from './dto/conversation-response.dto';
import { ConversationControlResponseDto } from './dto/conversation-control-response.dto';
import { ConversationQuoteReviewDto } from './dto/quote-review-response.dto';
import { RequestQuoteChangesDto } from './dto/request-quote-changes.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
    email: string;
  };
};

@ApiTags('Conversations')
@ApiCookieAuth('access_token')
@ApiBearerAuth('access_token_bearer')
@ApiUnauthorizedResponse({ description: 'La cookie de sesion es invalida o no existe.' })
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @ApiOperation({ summary: 'Listar conversaciones' })
  @ApiOkResponse({
    description: 'Resumen de conversaciones disponibles.',
    type: ConversationSummaryDto,
    isArray: true,
  })
  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  listConversations() {
    return this.conversationsService.listConversations();
  }

  @ApiOperation({ summary: 'Listar mensajes de una conversacion' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Historial cronologico de la conversacion.',
    type: ConversationMessageDto,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: 'La conversacion solicitada no existe.' })
  @Get('conversations/:conversationId/messages')
  @UseGuards(JwtAuthGuard)
  listConversationMessages(@Param('conversationId') conversationId: string) {
    return this.conversationsService.listConversationMessages(conversationId);
  }

  @ApiOperation({ summary: 'Obtener el quote en revision de una conversacion' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Preview del draft mas reciente dentro del flujo de revision comercial.',
    type: ConversationQuoteReviewDto,
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o no tiene quote dentro del flujo de revision.',
  })
  @Get('conversations/:conversationId/quote-review')
  @UseGuards(JwtAuthGuard)
  getConversationQuoteReview(@Param('conversationId') conversationId: string) {
    return this.conversationsService.getConversationQuoteReview(conversationId);
  }

  @ApiOperation({ summary: 'Descargar el PDF comercial del quote activo de una conversacion' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF comercial del draft mas reciente dentro del flujo de revision.',
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o no tiene quote dentro del flujo de revision.',
  })
  @Get('conversations/:conversationId/quote-review/pdf')
  @UseGuards(JwtAuthGuard)
  async downloadConversationQuoteReviewPdf(
    @Param('conversationId') conversationId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.conversationsService.getConversationQuoteReviewPdf(
      conversationId,
    );

    res.setHeader('Content-Type', pdf.mimeType);
    res.setHeader('Content-Length', pdf.sizeBytes.toString());
    res.setHeader('Content-Disposition', `inline; filename="${pdf.fileName}"`);
    res.send(pdf.content);
  }

  @ApiOperation({ summary: 'Aprobar el quote activo de una conversacion desde CRM' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Detalle refrescado del quote despues de aprobarlo y enviarlo al cliente.',
    type: ConversationQuoteReviewDto,
  })
  @ApiBadRequestResponse({
    description: 'La version es invalida, falta informacion o el draft no admite aprobacion.',
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o la version no coincide con el draft activo.',
  })
  @Post('conversations/:conversationId/quote-review/approve')
  @UseGuards(JwtAuthGuard)
  approveConversationQuote(
    @Param('conversationId') conversationId: string,
    @Body() dto: ApproveQuoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.approveConversationQuote(
      conversationId,
      dto,
      req.user.email,
    );
  }

  @ApiOperation({ summary: 'Solicitar cambios sobre el quote activo de una conversacion desde CRM' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Detalle refrescado del quote despues de registrar la solicitud de cambios.',
    type: ConversationQuoteReviewDto,
  })
  @ApiBadRequestResponse({
    description: 'La version es invalida, falta feedback o el draft no admite solicitud de cambios.',
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o la version no coincide con el draft activo.',
  })
  @Post('conversations/:conversationId/quote-review/request-changes')
  @UseGuards(JwtAuthGuard)
  requestConversationQuoteChanges(
    @Param('conversationId') conversationId: string,
    @Body() dto: RequestQuoteChangesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.requestConversationQuoteChanges(
      conversationId,
      dto,
      req.user.email,
    );
  }

  @ApiOperation({
    summary:
      'Aplicar ajustes manuales del owner (rango/supuestos) sobre el quote activo desde CRM',
  })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description:
      'Detalle refrescado del quote despues de registrar ajustes manuales y auditoria.',
    type: ConversationQuoteReviewDto,
  })
  @ApiBadRequestResponse({
    description:
      'El rango no es valido, no hay cambios para aplicar o el draft no admite ajustes manuales.',
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o la version no coincide con el draft activo.',
  })
  @Post('conversations/:conversationId/quote-review/owner-adjustments')
  @UseGuards(JwtAuthGuard)
  applyOwnerAdjustments(
    @Param('conversationId') conversationId: string,
    @Body() dto: ApplyOwnerAdjustmentsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.applyOwnerAdjustments(
      conversationId,
      dto,
      req.user.email,
    );
  }

  @ApiOperation({ summary: 'Reenviar el PDF del quote activo al cliente desde CRM' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({ description: 'PDF reenviado correctamente al cliente.' })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe o no tiene quote con PDF disponible.',
  })
  @Post('conversations/:conversationId/quote-review/resend-pdf')
  @UseGuards(JwtAuthGuard)
  async resendQuotePdf(@Param('conversationId') conversationId: string) {
    await this.conversationsService.resendQuotePdfToCustomer(conversationId);
  }

  @ApiOperation({ summary: 'Forzar la generacion del quote draft para una conversacion' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Quote draft generado correctamente.',
    type: ConversationQuoteReviewDto,
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe.',
  })
  @ApiBadRequestResponse({
    description: 'El brief no tiene suficiente informacion para generar el quote.',
  })
  @Post('conversations/:conversationId/quote-review/generate')
  @UseGuards(JwtAuthGuard)
  async forceGenerateQuoteDraft(@Param('conversationId') conversationId: string) {
    return this.conversationsService.forceGenerateQuoteDraft(conversationId);
  }

  @ApiOperation({
    summary: 'Reiniciar el brief comercial y archivar drafts activos para una conversacion',
  })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Estado recoverable del quote luego de reiniciar el brief.',
    type: ConversationQuoteReviewDto,
  })
  @ApiNotFoundResponse({
    description: 'La conversacion no existe.',
  })
  @Post('conversations/:conversationId/quote-review/restart-brief')
  @UseGuards(JwtAuthGuard)
  restartConversationQuoteBrief(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.restartConversationQuoteBrief(
      conversationId,
      req.user.email,
    );
  }

  @ApiOperation({ summary: 'Enviar mensaje manual a una conversacion' })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiCreatedResponse({
    description: 'Mensaje enviado y persistido correctamente.',
    type: ConversationMessageDto,
  })
  @Post('conversations/:conversationId/messages')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(conversationId, dto.body);
  }

  @ApiOperation({
    summary: 'Transferir una conversacion a control humano desde CRM',
  })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description: 'Control actualizado a humano correctamente.',
    type: ConversationControlResponseDto,
  })
  @ApiNotFoundResponse({ description: 'La conversacion solicitada no existe.' })
  @Post('conversations/:conversationId/control/human')
  @UseGuards(JwtAuthGuard)
  transferControlToHuman(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.transferControlToHuman(
      conversationId,
      req.user.email,
    );
  }

  @ApiOperation({
    summary: 'Devolver una conversacion a IA desde CRM',
  })
  @ApiParam({
    name: 'conversationId',
    example: '573001112233',
    description: 'Telefono normalizado usado como id estable de la conversacion.',
  })
  @ApiOkResponse({
    description:
      'Control actualizado a pending_resume para que el siguiente inbound vuelva al flujo IA.',
    type: ConversationControlResponseDto,
  })
  @ApiNotFoundResponse({ description: 'La conversacion solicitada no existe.' })
  @Post('conversations/:conversationId/control/ai-resume')
  @UseGuards(JwtAuthGuard)
  returnControlToAi(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.conversationsService.returnControlToAi(
      conversationId,
      req.user.email,
    );
  }
}
