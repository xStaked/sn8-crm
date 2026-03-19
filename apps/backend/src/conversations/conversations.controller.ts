import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ConversationMessageDto,
  ConversationSummaryDto,
} from './dto/conversation-response.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

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
