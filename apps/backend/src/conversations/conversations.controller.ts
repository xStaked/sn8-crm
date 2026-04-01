import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApproveQuoteDto } from './dto/approve-quote.dto';
import {
  ConversationMessageDto,
  ConversationSummaryDto,
} from './dto/conversation-response.dto';
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
}
