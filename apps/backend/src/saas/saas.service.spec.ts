import { SaasService } from './saas.service';

describe('SaasService', () => {
  it('normalizes phone numbers for stable conversation ids', () => {
    const service = new SaasService({} as any);

    expect(service.buildConversationId('+57 300-111-2233')).toBe('573001112233');
    expect(service.buildConversationId('573001112233')).toBe('573001112233');
  });
});
