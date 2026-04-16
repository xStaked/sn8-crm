import { Injectable } from '@nestjs/common';
import { ChannelType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BOT_NAME,
  DEFAULT_BOT_SLUG,
  DEFAULT_CHANNEL_CONNECTION_NAME,
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_SLUG,
} from './saas.constants';

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultWorkspace(): Promise<{
    workspaceId: string;
    botId: string;
    channelConnectionId: string;
  }> {
    const workspace = await this.prisma.workspace.upsert({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      update: { name: DEFAULT_WORKSPACE_NAME },
      create: {
        name: DEFAULT_WORKSPACE_NAME,
        slug: DEFAULT_WORKSPACE_SLUG,
      },
    });

    const bot = await this.prisma.bot.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: DEFAULT_BOT_SLUG,
        },
      },
      update: { name: DEFAULT_BOT_NAME },
      create: {
        workspaceId: workspace.id,
        name: DEFAULT_BOT_NAME,
        slug: DEFAULT_BOT_SLUG,
        status: 'active',
      },
    });

    const channelConnection = await this.prisma.channelConnection.findFirst({
      where: {
        workspaceId: workspace.id,
        type: ChannelType.whatsapp,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const ensuredChannelConnection = channelConnection
      ? channelConnection
      : await this.prisma.channelConnection.create({
          data: {
            workspaceId: workspace.id,
            botId: bot.id,
            type: ChannelType.whatsapp,
            name: DEFAULT_CHANNEL_CONNECTION_NAME,
            status: 'active',
          },
          select: { id: true },
        });

    return {
      workspaceId: workspace.id,
      botId: bot.id,
      channelConnectionId: ensuredChannelConnection.id,
    };
  }

  async ensureDefaultWorkspaceBackfill(): Promise<{
    workspaceId: string;
    botId: string;
    channelConnectionId: string;
    conversationsCreated: number;
    messagesUpdated: number;
    briefsUpdated: number;
    draftsUpdated: number;
    reviewEventsUpdated: number;
  }> {
    const base = await this.ensureDefaultWorkspace();

    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fromPhone: true,
        toPhone: true,
        direction: true,
        createdAt: true,
        workspaceId: true,
        conversationId: true,
      },
    });

    const conversationKeys = new Map<
      string,
      { customerPhone: string; lastMessageAt: Date }
    >();

    for (const message of messages) {
      const customerPhone = this.resolveConversationPhone(message);
      const existing = conversationKeys.get(customerPhone);
      if (!existing || existing.lastMessageAt < message.createdAt) {
        conversationKeys.set(customerPhone, {
          customerPhone,
          lastMessageAt: message.createdAt,
        });
      }
    }

    const conversationIdByPhone = new Map<string, string>();
    let conversationsCreated = 0;

    for (const entry of conversationKeys.values()) {
      const conversation = await this.prisma.conversation.upsert({
        where: {
          workspaceId_customerPhone: {
            workspaceId: base.workspaceId,
            customerPhone: entry.customerPhone,
          },
        },
        update: {
          botId: base.botId,
          channelConnectionId: base.channelConnectionId,
          lastMessageAt: entry.lastMessageAt,
        },
        create: {
          workspaceId: base.workspaceId,
          botId: base.botId,
          channelConnectionId: base.channelConnectionId,
          customerPhone: entry.customerPhone,
          status: 'open',
          lastMessageAt: entry.lastMessageAt,
        },
        select: { id: true },
      });

      conversationIdByPhone.set(entry.customerPhone, conversation.id);
      conversationsCreated += 1;
    }

    let messagesUpdated = 0;
    for (const message of messages) {
      const customerPhone = this.resolveConversationPhone(message);
      const conversationId = conversationIdByPhone.get(customerPhone);
      if (!conversationId) {
        continue;
      }

      const needsUpdate =
        message.workspaceId !== base.workspaceId ||
        message.conversationId !== conversationId;

      if (!needsUpdate) {
        continue;
      }

      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          workspaceId: base.workspaceId,
          conversationId,
          botId: base.botId,
          channelConnectionId: base.channelConnectionId,
        },
      });
      messagesUpdated += 1;
    }

    const briefsUpdated = (
      await this.prisma.$transaction(async (tx) => {
        const briefs = await tx.commercialBrief.findMany({
          select: { id: true, conversationId: true, workspaceId: true, conversationRefId: true },
        });

        let count = 0;
        for (const brief of briefs) {
          const conversationId = conversationIdByPhone.get(
            this.normalizePhone(brief.conversationId),
          );
          if (!conversationId) {
            continue;
          }

          const needsUpdate =
            brief.workspaceId !== base.workspaceId ||
            brief.conversationRefId !== conversationId;

          if (!needsUpdate) {
            continue;
          }

          await tx.commercialBrief.update({
            where: { id: brief.id },
            data: {
              workspaceId: base.workspaceId,
              conversationRefId: conversationId,
            },
          });
          count += 1;
        }

        return count;
      })
    );

    const draftsUpdateResult = await this.prisma.quoteDraft.updateMany({
      where: { workspaceId: null },
      data: { workspaceId: base.workspaceId },
    });

    const reviewEventsUpdateResult = await this.prisma.quoteReviewEvent.updateMany({
      where: { workspaceId: null },
      data: { workspaceId: base.workspaceId },
    });

    return {
      ...base,
      conversationsCreated,
      messagesUpdated,
      briefsUpdated,
      draftsUpdated: draftsUpdateResult.count,
      reviewEventsUpdated: reviewEventsUpdateResult.count,
    };
  }

  buildConversationId(phone: string): string {
    return this.normalizePhone(phone);
  }

  private resolveConversationPhone(message: {
    fromPhone: string;
    toPhone: string;
    direction: string;
  }): string {
    if (message.direction === 'inbound') {
      return this.normalizePhone(message.fromPhone);
    }

    return this.normalizePhone(message.toPhone);
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d]/g, '');
  }
}
