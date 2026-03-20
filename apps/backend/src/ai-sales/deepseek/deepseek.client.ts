import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  CommercialBriefSnapshot,
  ExtractCommercialBriefInput,
  GenerateQuoteDraftInput,
  QuoteDraftResult,
  RegenerateQuoteDraftInput,
} from '../ai-provider.interface';
import { SALES_AGENT_SYSTEM_PROMPT } from '../prompts/sales-agent.system';

type DeepSeekMessage = {
  role: 'system' | 'user';
  content: string;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

@Injectable()
export class DeepSeekClient implements AiProvider {
  private readonly logger = new Logger(DeepSeekClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY')?.trim() ?? '';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL')?.trim() ??
      'https://api.deepseek.com';
    this.model =
      this.config.get<string>('DEEPSEEK_MODEL')?.trim() ?? 'deepseek-chat';
    this.timeoutMs = Number(
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS')?.trim() ?? '30000',
    );
  }

  async extractCommercialBrief(
    input: ExtractCommercialBriefInput,
  ): Promise<CommercialBriefSnapshot> {
    const content = await this.createCompletion([
      {
        role: 'system',
        content: `${SALES_AGENT_SYSTEM_PROMPT}

Devuelve solo JSON valido con estas llaves:
customerName, projectType, businessProblem, desiredScope, budget, urgency, constraints, summary.`,
      },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ]);

    return this.parseJson<CommercialBriefSnapshot>(content);
  }

  async generateQuoteDraft(
    input: GenerateQuoteDraftInput,
  ): Promise<QuoteDraftResult> {
    const content = await this.createCompletion([
      {
        role: 'system',
        content: `${SALES_AGENT_SYSTEM_PROMPT}

Devuelve solo JSON valido con estas llaves:
summary, structuredDraft, renderedQuote.`,
      },
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ]);

    const parsed = this.parseJson<Omit<QuoteDraftResult, 'model'>>(content);
    return {
      summary: parsed.summary,
      structuredDraft: parsed.structuredDraft,
      renderedQuote: parsed.renderedQuote,
      model: this.model,
    };
  }

  async regenerateQuoteDraft(
    input: RegenerateQuoteDraftInput,
  ): Promise<QuoteDraftResult> {
    return this.generateQuoteDraft({
      conversationId: input.conversationId,
      transcript: input.transcript,
      commercialBrief: input.commercialBrief,
      quoteTemplate: input.quoteTemplate,
    });
  }

  private async createCompletion(messages: DeepSeekMessage[]): Promise<string> {
    this.assertConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error({
          event: 'deepseek_completion_failed',
          status: response.status,
          body,
        });
        throw new Error(`DeepSeek request failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as DeepSeekResponse;
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error('DeepSeek response did not contain message content.');
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson<T>(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new Error(
        `DeepSeek returned invalid JSON content: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error(
        'DeepSeekClient is not configured. Set DEEPSEEK_API_KEY before invoking AI sales workflows.',
      );
    }
  }
}
