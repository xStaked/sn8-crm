import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KapsoWebhookMessageDocDto {
  @ApiPropertyOptional({
    example: 'msg_e2e_nested',
    description: 'Identificador del mensaje si Kapso lo envia en el nivel raiz.',
  })
  id?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Campos adicionales enviados por Kapso.',
  })
  additionalPayload?: Record<string, unknown>;
}

export class KapsoWebhookDocDto {
  @ApiPropertyOptional({
    type: () => KapsoWebhookMessageDocDto,
    description: 'Mensaje raiz opcional enviado por Kapso.',
  })
  message?: KapsoWebhookMessageDocDto;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Entradas del webhook segun el payload de Kapso.',
    items: {
      type: 'object',
      additionalProperties: true,
      example: {
        id: '987654321',
        changes: [
          {
            field: 'messages',
            value: {
              messages: [{ id: 'msg_e2e_nested', from: '573001234567', type: 'text' }],
            },
          },
        ],
      },
    },
  })
  entry?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Swagger permite propiedades extra para reflejar el payload real del proveedor.',
  })
  additionalPayload?: Record<string, unknown>;
}

export class KapsoWebhookIgnoredResponseDto {
  @ApiProperty({ example: 'ok' })
  message: string;

  @ApiProperty({ example: 'ignored', enum: ['ignored'] })
  status: 'ignored';
}

export class KapsoWebhookDuplicateResponseDto {
  @ApiProperty({ example: 'ok' })
  message: string;

  @ApiProperty({ example: 'duplicate', enum: ['duplicate'] })
  status: 'duplicate';

  @ApiProperty({ example: 'msg_e2e_dup' })
  messageId: string;
}

export class KapsoWebhookEnqueuedResponseDto {
  @ApiProperty({ example: 'ok' })
  message: string;

  @ApiProperty({ example: 'enqueued', enum: ['enqueued'] })
  status: 'enqueued';

  @ApiProperty({ example: 'msg_e2e_nested' })
  messageId: string;
}
