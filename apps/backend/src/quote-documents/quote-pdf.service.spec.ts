import { NotFoundException } from '@nestjs/common';
import { QuotePdfService } from './quote-pdf.service';

function buildDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft_v1',
    conversationId: '+573001234567',
    version: 1,
    reviewStatus: 'pending_owner_review',
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
    renderedQuote: 'Alcance preliminar, cronograma y valor total: COP 12.500.000.',
    draftPayload: {
      summary: 'Cotizacion preliminar para CRM comercial con aprobacion.',
      structuredDraft: {
        ownerReviewDraft: {
          title: 'CRM comercial para Norgtech',
          pendingReviewLabel:
            'Documento generado para revision interna de SN8 Labs. No enviar al cliente sin aprobacion.',
          sections: [
            {
              label: 'Alcance',
              content: 'Implementacion de CRM con inbox, pipeline y seguimiento comercial.',
            },
            {
              label: 'Inversion',
              content: 'COP 12.500.000 + IVA',
            },
          ],
        },
      },
    },
    commercialBrief: {
      customerName: 'Norgtech',
      projectType: 'CRM comercial',
      summary: 'Cliente con necesidad de cotizacion formal y aprobacion previa.',
      budget: 'COP 10.000.000 - 15.000.000',
      urgency: 'Alta',
    },
    document: null,
    ...overrides,
  };
}

describe('QuotePdfService', () => {
  let drafts: Map<string, any>;
  let documents: Map<string, any>;
  let prisma: any;
  let service: QuotePdfService;

  beforeEach(() => {
    drafts = new Map([['draft_v1', buildDraft()]]);
    documents = new Map();

    prisma = {
      quoteDraft: {
        findUnique: jest.fn(async ({ where: { id } }: any) => {
          const draft = drafts.get(id);
          if (!draft) {
            return null;
          }

          return {
            ...draft,
            document: documents.get(id) ?? null,
          };
        }),
      },
      quoteDraftDocument: {
        findUnique: jest.fn(async ({ where: { quoteDraftId } }: any) => {
          return documents.get(quoteDraftId) ?? null;
        }),
        findUniqueOrThrow: jest.fn(async ({ where: { quoteDraftId } }: any) => {
          const existing = documents.get(quoteDraftId);
          if (!existing) {
            throw new Error('Document not found');
          }

          return existing;
        }),
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `doc_${data.quoteDraftId}`,
            ...data,
            content: Buffer.from(data.content),
          };
          documents.set(data.quoteDraftId, created);
          return created;
        }),
      },
    };

    service = new QuotePdfService(prisma);
    jest.spyOn(service as any, 'loadRenderer').mockResolvedValue({
      Document: ({ children }: any) => ({ type: 'Document', children }),
      Page: ({ children }: any) => ({ type: 'Page', children }),
      Text: ({ children }: any) => ({ type: 'Text', children }),
      View: ({ children }: any) => ({ type: 'View', children }),
      StyleSheet: {
        create: (styles: Record<string, unknown>) => styles,
      },
      renderToBuffer: jest.fn(async () => Buffer.from('%PDF-1.4 fake quote pdf')),
    });
  });

  it('renders and persists a PDF on the first request for a draft', async () => {
    const document = await service.getOrCreateDraftPdf('draft_v1');

    expect(prisma.quoteDraft.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_v1' },
      }),
    );
    expect(prisma.quoteDraftDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteDraftId: 'draft_v1',
          kind: 'commercial_pdf',
          mimeType: 'application/pdf',
          checksumSha256: expect.any(String),
          sizeBytes: expect.any(Number),
          fileName: 'cotizacion-sn8-573001234567-v1.pdf',
        }),
      }),
    );
    expect(document.content.subarray(0, 4).toString()).toBe('%PDF');
    expect(document.sizeBytes).toBeGreaterThan(0);
  });

  it('reuses the cached artifact for the same quoteDraftId', async () => {
    const first = await service.getOrCreateDraftPdf('draft_v1');
    const second = await service.getOrCreateDraftPdf('draft_v1');

    expect(second.id).toBe(first.id);
    expect(prisma.quoteDraftDocument.create).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a previous draft document row for a regenerated version', async () => {
    const first = await service.getOrCreateDraftPdf('draft_v1');
    drafts.set(
      'draft_v2',
      buildDraft({
        id: 'draft_v2',
        version: 2,
        renderedQuote: 'Nueva version con alcance ampliado. Valor total: COP 18.900.000.',
      }),
    );

    const second = await service.getOrCreateDraftPdf('draft_v2');

    expect(first.quoteDraftId).toBe('draft_v1');
    expect(second.quoteDraftId).toBe('draft_v2');
    expect(second.id).not.toBe(first.id);
    expect(prisma.quoteDraftDocument.create).toHaveBeenCalledTimes(2);
  });

  it('raises a not found error when the draft does not exist', async () => {
    await expect(service.getOrCreateDraftPdf('missing_draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
