import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type QuoteDraftDocument } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QuotePdfDocument } from './documents/quote-pdf.document';
import { mapQuoteDraftToPdfDocument } from './quote-pdf.mapper';

type QuoteDraftWithContext = {
  id: string;
  conversationId: string;
  version: number;
  reviewStatus: string;
  createdAt: Date;
  renderedQuote: string | null;
  draftPayload: unknown;
  commercialBrief: {
    customerName: string | null;
    projectType: string | null;
    summary: string | null;
    budget: string | null;
    urgency: string | null;
  };
  document: QuoteDraftDocument | null;
};

@Injectable()
export class QuotePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDraftPdf(quoteDraftId: string): Promise<QuoteDraftDocument> {
    const existing = await this.prisma.quoteDraftDocument.findUnique({
      where: { quoteDraftId },
    });

    if (existing) {
      return existing;
    }

    const draft = await this.loadDraft(quoteDraftId);
    if (draft.document) {
      return draft.document;
    }

    const buffer = await this.renderDraftPdf(draft);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const sizeBytes = buffer.byteLength;
    const mapped = mapQuoteDraftToPdfDocument(draft);
    const contentBytes = Uint8Array.from(buffer);

    try {
      return await this.prisma.quoteDraftDocument.create({
        data: {
          quoteDraftId: draft.id,
          kind: 'commercial_pdf',
          fileName: mapped.fileName,
          mimeType: 'application/pdf',
          checksumSha256,
          sizeBytes,
          content: contentBytes,
          generatedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.quoteDraftDocument.findUniqueOrThrow({
          where: { quoteDraftId: draft.id },
        });
      }

      throw error;
    }
  }

  private async loadDraft(quoteDraftId: string): Promise<QuoteDraftWithContext> {
    const draft = await this.prisma.quoteDraft.findUnique({
      where: { id: quoteDraftId },
      include: {
        commercialBrief: {
          select: {
            customerName: true,
            projectType: true,
            summary: true,
            budget: true,
            urgency: true,
          },
        },
        document: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Quote draft ${quoteDraftId} was not found.`);
    }

    return draft;
  }

  private async renderDraftPdf(draft: QuoteDraftWithContext): Promise<Buffer> {
    const renderer = await this.loadRenderer();
    const mapped = mapQuoteDraftToPdfDocument(draft);
    const document = QuotePdfDocument({
      renderer: {
        Document: renderer.Document,
        Page: renderer.Page,
        Text: renderer.Text,
        View: renderer.View,
        StyleSheet: renderer.StyleSheet,
      },
      document: mapped,
    });
    const rendered = await renderer.renderToBuffer(document);

    return Buffer.isBuffer(rendered) ? rendered : Buffer.from(rendered);
  }

  protected async loadRenderer() {
    return import('@react-pdf/renderer');
  }
}
