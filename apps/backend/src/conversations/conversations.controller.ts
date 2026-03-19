import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';

@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  listConversations() {
    return this.conversationsService.listConversations();
  }

  @Get('conversations/:conversationId/messages')
  @UseGuards(JwtAuthGuard)
  listConversationMessages(@Param('conversationId') conversationId: string) {
    return this.conversationsService.listConversationMessages(conversationId);
  }
}
