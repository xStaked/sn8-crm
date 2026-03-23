import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema conversation state contract', () => {
  it('declares a durable ConversationState model for bot routing state', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('model ConversationState');
    expect(schema).toContain('conversationId   String   @unique');
    expect(schema).toContain('state            String');
    expect(schema).toContain('metadata         Json?');
    expect(schema).toContain('offFlowCount     Int');
    expect(schema).toContain('lastTransitionAt DateTime');
    expect(schema).toContain('expiresAt        DateTime');
    expect(schema).toContain('@@index([expiresAt])');
  });
});
