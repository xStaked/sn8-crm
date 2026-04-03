export type QuoteTemplateSection = {
  key: string;
  label: string;
  required: boolean;
  guidance: string;
};

export type QuoteTemplateContract = {
  version: string;
  ownerTemplateProvided: boolean;
  status: 'ready';
  brandVoice: 'premium-consultive';
  customerDisclosure: string;
  reviewGateLabel: string;
  sections: QuoteTemplateSection[];
  pendingOwnerInputs: string[];
};

export const QUOTE_TEMPLATE: QuoteTemplateContract = {
  version: '2026-04-03.commercial-template-v1',
  ownerTemplateProvided: true,
  status: 'ready',
  brandVoice: 'premium-consultive',
  customerDisclosure:
    'Esta es una cotizacion preliminar preparada por SN8 Labs y queda sujeta a revision y aprobacion interna antes de cualquier envio final al cliente.',
  reviewGateLabel: 'Borrador comercial para revision del socio',
  sections: [
    {
      key: 'executive-summary',
      label: 'Resumen ejecutivo',
      required: true,
      guidance:
        'Sintesis comercial del reto del cliente, oportunidad de negocio y propuesta de valor de SN8 Labs.',
    },
    {
      key: 'proposed-scope',
      label: 'Alcance propuesto',
      required: true,
      guidance:
        'Entregables, limites y responsabilidades por fase en lenguaje comercial claro y verificable.',
    },
    {
      key: 'commercial-assumptions',
      label: 'Supuestos y consideraciones comerciales',
      required: true,
      guidance:
        'Supuestos, dependencias del cliente, exclusiones explicitas y condiciones para sostener alcance y costo.',
    },
    {
      key: 'pricing-structure',
      label: 'Pricing y estructura economica',
      required: true,
      guidance:
        'Rango min-target-max, modalidad de cobro, terminos de pago y notas financieras relevantes para aprobacion.',
    },
    {
      key: 'implementation-timeline',
      label: 'Timeline y plan de implementacion',
      required: true,
      guidance:
        'Hitos, duraciones estimadas, dependencias criticas y fecha objetivo de arranque/cierre.',
    },
  ],
  pendingOwnerInputs: [],
};
