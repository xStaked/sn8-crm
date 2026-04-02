# Contexto de Fase: Conversación Fluida + Neuroventas

## Descripción
Transformar el bot comercial de SN8 Labs de una herramienta rígida de recolección de datos a un asesor conversacional que aplica principios de neuroventas para mejorar conversión y experiencia del usuario.

## Problemas Prioritarios

### P0 - Bug Crítico: Nuevo Proyecto
**Escenario**: Usuario con cotización previa (ej: CRM con IA) intenta cotizar nuevo proyecto (ej: app veterinaria)

**Comportamiento actual**: Bot repite mensaje de estado de cotización anterior, ignorando completamente la intención del usuario

**Comportamiento esperado**: Detectar "quiero cotizar otro proyecto", resetear brief, iniciar nueva conversación

**Evidencia** (conversación real con Sergio):
```
Sergio: "quiero cotizar otro proyecto contigo, seria una aplicacion mobile..."
Bot: "Perfecto. Con lo que tengo hasta ahora, voy a cotizar CRM con IA..."
Sergio: "pero te estoy pidiendo otra cosa"
Bot: "Perfecto. Con lo que tengo hasta ahora, voy a cotizar CRM con IA..." (repetido)
```

### P1 - Conversación Robótica
- Mensajes estáticos y predecibles
- Falta de variación en respuestas
- Tono corporativo en lugar de conversacional

### P2 - Sin Neuroventas
- No hay técnicas de persuasión
- No se manejan objeciones
- Falta conexión emocional
- No hay creación de urgencia/valor

## Definición de Hecho (Definition of Done)

- [ ] Bug P0 corregido y testeado
- [ ] Sistema de variantes de mensajes implementado
- [ ] Prompts mejorados con técnicas de neuroventas
- [ ] Contexto conversacional persistido y utilizado
- [ ] Off-flow manejado naturalmente
- [ ] Tests unitarios pasan
- [ ] Al menos 3 conversaciones de prueba muestran mejora cualitativa

## Restricciones
- Mantener compatibilidad con sistema de estados existente
- No cambiar contratos de API externos
- Migración gradual sin downtime
- Preservar lógica de calificación de leads

## Métricas de Éxito

### Técnicas
- Cobertura de tests > 80% en módulos modificados
- Tiempo de respuesta < 2s (mantener actual)

### Negocio
- Reducción 50% en "human handoff" por frustración
- Incremento 20% en briefs completados
- Feedback cualitativo positivo en conversaciones

## Notas de Implementación

### Archivos Clave
1. `conversation-flow.service.ts` - Core del flujo de cotización
2. `bot-conversation.service.ts` - Máquina de estados
3. `discovery-reply.prompt.ts` - Prompt de IA para discovery
4. `greeting-messages.ts` - Mensajes de saludo
5. `schema.prisma` - Extensión de modelo CommercialBrief

### Dependencias Externas
- Deepseek API para generación de respuestas
- WhatsApp Business API para mensajería
- Prisma ORM para persistencia

### Riesgos
- Cambios en prompts pueden afectar calidad de extracción de brief
- Extensión de schema requiere migración de base de datos
- Variantes de mensajes pueden ser inconsistentes si no se prueban bien
