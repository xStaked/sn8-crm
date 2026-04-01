# SN8 WPP CRM

## What This Is

CRM con automatización de WhatsApp para SN8 Labs, una agencia de desarrollo de software. El bot atiende mensajes entrantes de clientes, captura requerimientos de proyectos, genera cotizaciones usando IA (DeepSeek), y las somete a aprobación del socio antes de enviarlas. El CRM permite a los socios gestionar el pipeline de ventas, historial de clientes y cotizaciones desde un panel centralizado.

## Core Value

El bot nunca deja a un cliente sin respuesta y toda cotización pasa por validación del socio antes de enviarse — garantizando rentabilidad sin sacrificar velocidad de respuesta.

## Requirements

### Validated

- [x] El agente IA comercial premium guía el discovery y prepara cotizaciones preliminares en formato definido por el socio
- [x] El flujo de aprobación humana mantiene la cotización bloqueada hasta revisión explícita del socio
- [x] El CRM conectado al backend real permite autenticar, listar conversaciones y ver el historial real
- [x] El socio puede revisar, aprobar o solicitar cambios de una cotización pendiente directamente desde el CRM web y la aprobación dispara la entrega automática al cliente

### Active

- [ ] Bot de WhatsApp atiende mensajes entrantes automáticamente via Kapso.ai
- [ ] Bot captura requerimientos del proyecto mediante conversación guiada
- [ ] DeepSeek genera cotizaciones basadas en requerimientos capturados
- [ ] CRM con historial de clientes y conversaciones
- [ ] Pipeline de ventas (lead → cotizado → cerrado / perdido)
- [ ] Asignación de conversaciones a agentes (socios)
- [ ] Integración futura con Instagram (arquitectura preparada)

## Current State

Phase 05.3 complete: el CRM web ya muestra cotizaciones pendientes, permite previsualizar la propuesta, aprobarla o pedir cambios, y al aprobar dispara la entrega automática al cliente usando el backend real actual.

### Out of Scope

- Integración con Instagram en v1 — se deja la arquitectura lista pero no se implementa
- App móvil — web-first (Next.js)
- Pagos en línea — el cierre comercial ocurre fuera del sistema por ahora

## Context

- **Empresa:** SN8 Labs — 2 socios desarrolladores que venden servicios de software (apps, automatizaciones, ecommerce, landings, marca blanca)
- **Problema actual:** Ambos socios se ocupan y los clientes quedan sin respuesta. El proceso de cotización es lento y manual (existe un GPT interno para cotizar pero requiere revisión manual)
- **Complejidad del pricing:** El precio de un proyecto varía enormemente según tecnología, alcance y rentabilidad (ej: un CRM básico vs. uno con pipeline de ventas pueden tener precios muy diferentes). El bot debe proponer, el socio valida rentabilidad
- **Canal principal:** WhatsApp via Kapso.ai (API de mensajería)
- **Escala inicial:** 1-5 agentes, < 50 conversaciones/día
- **Expectativa comercial:** La IA debe cubrir la mayor parte posible del proceso de venta sin saltarse la aprobación humana de cotizaciones

## Constraints

- **Tech Stack**: NestJS (backend) + Next.js (frontend CRM) + DeepSeek (IA) + Kapso.ai (WhatsApp) — no negociable
- **Escala**: Pequeño equipo (2 socios + posibles asistentes), solución debe ser liviana y operable sin DevOps dedicado
- **Pricing complexity**: El bot NO envía cotizaciones sin aprobación humana — es un hard requirement de negocio
- **Experiencia comercial**: La IA debe comportarse como asesor comercial experto en desarrollo de software, con tono premium y enfoque consultivo

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Kapso.ai para WhatsApp | Ya definido por el cliente, API de mensajería conocida | — Pending |
| DeepSeek para IA | Selección del cliente, buena relación costo/calidad | — Pending |
| Aprobación humana obligatoria en cotizaciones | Protege la rentabilidad — precio varía demasiado para automatizar sin revisión | — Pending |
| Next.js para CRM + NestJS backend | Stack moderno, separación clara frontend/backend, escalable | — Pending |
| Arquitectura multi-canal desde el inicio | Instagram en v2, pero el diseño debe soportar múltiples canales | — Pending |

---
*Last updated: 2026-04-01 after completing Phase 05.3 quote approval from CRM*
