import { Injectable } from '@nestjs/common';

export type GreetingIntent = 'quote_project' | 'learn_services' | 'human_handoff';

@Injectable()
export class IntentClassifierService {
  async classifyGreetingIntent(message: string | null | undefined): Promise<GreetingIntent> {
    const normalized = this.normalize(message);

    if (!normalized) {
      return 'quote_project';
    }

    if (this.matchesAny(normalized, ['asesor', 'humano', 'persona', 'alguien', 'llamar'])) {
      return 'human_handoff';
    }

    if (
      this.matchesAny(normalized, [
        'servicio',
        'servicios',
        'hacen',
        'ofrecen',
        'portafolio',
        'informacion',
        'información',
        'conocer',
      ])
    ) {
      return 'learn_services';
    }

    return 'quote_project';
  }

  private normalize(message: string | null | undefined): string {
    return (
      message
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim() ?? ''
    );
  }

  private matchesAny(message: string, tokens: string[]): boolean {
    return tokens.some((token) => message.includes(token));
  }
}
