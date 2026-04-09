import { ConfigService } from '@nestjs/config';
import { QuotePdfAccessLinkService } from './quote-pdf-access-link.service';

describe('QuotePdfAccessLinkService', () => {
  let config: ConfigService;
  let service: QuotePdfAccessLinkService;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'QUOTE_PDF_PUBLIC_LINK_SECRET') {
          return 'pdf-link-secret';
        }
        if (key === 'CRM_BASE_URL') {
          return 'https://crm.sn8labs.com';
        }
        if (key === 'QUOTE_PDF_PUBLIC_LINK_TTL_SECONDS') {
          return '3600';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new QuotePdfAccessLinkService(config);
  });

  it('builds and validates signed public quote pdf URLs', () => {
    const link = service.buildSignedPublicQuotePdfUrl('+573001112233');
    const url = new URL(link.url);

    expect(url.pathname).toBe(
      '/public/conversations/%2B573001112233/quote-review/pdf',
    );
    expect(url.searchParams.get('exp')).toBeTruthy();
    expect(url.searchParams.get('sig')).toBeTruthy();

    const validation = service.validatePublicQuotePdfUrlSignature({
      conversationId: '+573001112233',
      expiresAtRaw: url.searchParams.get('exp') ?? undefined,
      signature: url.searchParams.get('sig') ?? undefined,
    });

    expect(validation).toMatchObject({ ok: true });
  });

  it('rejects tampered signatures', () => {
    const link = service.buildSignedPublicQuotePdfUrl('+573001112233');
    const url = new URL(link.url);

    const validation = service.validatePublicQuotePdfUrlSignature({
      conversationId: '+573001112233',
      expiresAtRaw: url.searchParams.get('exp') ?? undefined,
      signature: 'tampered',
    });

    expect(validation).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });
});
