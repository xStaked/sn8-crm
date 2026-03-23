import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema conversation state contract', () => {
  it('declares a durable ConversationState model for bot routing state', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('model ConversationState');
    expect(schema).toMatch(/conversationId\s+String\s+@unique/);
    expect(schema).toMatch(/state\s+String/);
    expect(schema).toMatch(/metadata\s+Json\?/);
    expect(schema).toMatch(/offFlowCount\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/lastTransitionAt\s+DateTime/);
    expect(schema).toMatch(/expiresAt\s+DateTime/);
    expect(schema).toContain('@@index([expiresAt])');
  });
});
