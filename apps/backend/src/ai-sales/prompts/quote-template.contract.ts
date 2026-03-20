export type QuoteTemplateSection = {
  key: string;
  label: string;
  required: boolean;
  guidance: string;
};

export type QuoteTemplateContract = {
  version: string;
  ownerTemplateProvided: boolean;
  status: 'pending-owner-template' | 'ready';
  brandVoice: 'premium-consultive';
  customerDisclosure: string;
  reviewGateLabel: string;
  sections: QuoteTemplateSection[];
  pendingOwnerInputs: string[];
};

export const QUOTE_TEMPLATE: QuoteTemplateContract = {
  version: 'pending-owner-template',
  ownerTemplateProvided: false,
  status: 'pending-owner-template',
  brandVoice: 'premium-consultive',
  customerDisclosure:
    'Esta es una cotizacion preliminar preparada por SN8 Labs y queda sujeta a revision y aprobacion interna antes de cualquier envio final al cliente.',
  reviewGateLabel: 'pendiente de revision del socio',
  sections: [
    {
      key: 'project-context',
      label: 'Contexto del proyecto',
      required: true,
      guidance:
        'Resumen ejecutivo del problema de negocio, objetivo del proyecto y alcance preliminar confirmado con el cliente.',
    },
    {
      key: 'proposed-scope',
      label: 'Alcance propuesto',
      required: true,
      guidance:
        'Entregables y limites del alcance en lenguaje comercial claro, sin comprometer elementos no validados.',
    },
    {
      key: 'commercial-notes',
      label: 'Notas comerciales y supuestos',
      required: true,
      guidance:
        'Supuestos, restricciones, dependencias del cliente y advertencias necesarias antes de emitir una version final.',
    },
    {
      key: 'pricing-placeholder',
      label: 'Estructura de valor y precio preliminar',
      required: true,
      guidance:
        'Espacio reservado para la estructura exacta de pricing que el socio defina en su plantilla oficial.',
    },
  ],
  pendingOwnerInputs: [
    'Plantilla exacta de cotizacion aprobada por el socio',
    'Orden final de secciones y encabezados obligatorios',
    'Formato de pricing, moneda y notas legales/comerciales',
    'Ejemplos reales de cotizaciones validas e invalidas para la marca',
  ],
};
