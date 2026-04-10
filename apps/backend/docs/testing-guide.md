# Guía de Testing para el Bot LangGraph Mejorado

## Prerrequisitos

1. Asegúrate de que las variables de entorno estén configuradas:
```bash
AI_SALES_LANGGRAPH_ENABLED=true
AI_SALES_LANGGRAPH_SHADOW_MODE=false
DEEPSEEK_API_KEY=tu-api-key
```

2. Reinicia el backend para cargar los nuevos servicios:
```bash
cd apps/backend
npm run start:dev
```

## Escenarios de Test

### Test 1: Conversación Nueva - Proyecto Simple

**Objetivo**: Verificar que el bot maneja una conversación desde cero

**Pasos**:
1. Enviar: `Hola`
2. Esperar greeting con botones
3. Seleccionar "Cotizar proyecto" o enviar: `Quiero cotizar un proyecto`
4. Bot debería preguntar sobre el tipo de proyecto
5. Enviar: `Necesito una landing page para mi restaurante`
6. Bot debería hacer preguntas de descubrimiento (una a la vez):
   - Problema/objetivo
   - Alcance deseado
   - Budget (opcional)
   - Urgencia (opcional)
7. Después de 3-5 rondas, bot debería confirmar que va a preparar propuesta

**Resultado Esperado**:
- ✅ Bot hace preguntas variadas, no repetitivas
- ✅ Bot entiende el contexto
- ✅ Respuestas naturales y conversacionales
- ✅ No repite el mismo mensaje

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_transition
kubectl logs -f | grep ai_intent_classification
```

---

### Test 2: Cambio de Proyecto

**Objetivo**: Verificar que el bot maneja cambiar de proyecto

**Pasos**:
1. Completa Test 1 hasta que el bot confirme que prepara propuesta
2. Enviar: `quiero cotizar otro proyecto`
3. Bot debería archivar el contexto anterior y empezar de nuevo
4. Enviar: `necesito una automatización con Google Sheets`
5. Bot debería hacer preguntas sobre el nuevo proyecto

**Resultado Esperado**:
- ✅ Bot reinicia conversación limpiamente
- ✅ No mezcla contextos de proyectos
- ✅ Pregunta sobre el nuevo proyecto

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_new_project_archived
```

---

### Test 3: Usuario Confundido

**Objetivo**: Verificar que el bot maneja confusión

**Pasos**:
1. Después de recibir una propuesta (o en medio de discovery)
2. Enviar: `de qué proyecto hablas?`
3. O: `no entiendo, qué cotización?`

**Resultado Esperado**:
- ✅ Bot aclara el contexto actual
- ✅ Menciona el proyecto específico en el brief
- ✅ Ofrece empezar de cero si es incorrecto
- ✅ Respuesta natural, no genérica

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_clarification
kubectl logs -f | grep dynamic_response_generation
```

---

### Test 4: Respuesta Después de Cotización Enviada

**Objetivo**: Verificar respuestas contextuales post-delivery

**Escenario 4A: Aceptación**
1. Con una cotización ya enviada (`delivered_to_customer`)
2. Enviar: `dale, avancemos`
3. O: `perfecto, me gusta`

**Resultado Esperado**:
- ✅ Bot confirma que va a coordinar siguiente paso
- ✅ Mensaje variado, no repetitivo
- ✅ Tono profesional y cercano

**Escenario 4B: Pedido de PDF**
1. Con cotización enviada
2. Enviar: `me puedes mandar el PDF?`
3. O: `quiero descargar la propuesta`

**Resultado Esperado**:
- ✅ Bot proporciona enlace al PDF
- ✅ Pregunta si hay dudas adicionales

**Escenario 4C: Preguntas sobre cotización**
1. Con cotización enviada
2. Enviar: `tengo una pregunta sobre el precio`
3. O: `cuánto tiempo va a tomar?`

**Resultado Esperado**:
- ✅ Reconoce que hay dudas
- ✅ Ofrece pasar a asesor humano
- ✅ No inventa información

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_post_delivery
kubectl logs -f | grep dynamic_response_generation
```

---

### Test 5: Frustración del Usuario

**Objetivo**: Verificar detección de frustración y handoff a humano

**Pasos**:
1. En cualquier punto de la conversación
2. Enviar: `esto es una mierda, no funciona`
3. O: `qué pésimo servicio, quiero hablar con alguien`

**Resultado Esperado**:
- ✅ Detecta frustración inmediatamente
- ✅ Se disculpa
- ✅ Pasa a humano
- ✅ Notifica al equipo interno

**Ver Logs**:
```bash
kubectl logs -f | grep human_handoff
kubectl logs -f | grep frustration_detected
```

---

### Test 6: Conversación Larga (Quality Check)

**Objetivo**: Verificar quality checker detecta conversaciones off-track

**Pasos**:
1. Iniciar conversación de discovery
2. Dar respuestas vagas o evasivas por 8+ rondas
3. Ejemplo:
   - Bot: "¿Qué tipo de proyecto?"
   - Tú: "no sé, algo"
   - Bot: "¿Cuál es el problema?"
   - Tú: "varias cosas"
   - (Repetir 8+ veces)

**Resultado Esperado**:
- ✅ Quality checker marca conversación como unhealthy
- ✅ Loggea recomendaciones
- ✅ Sugiere escalación a humano después de muchas rondas

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_quality_check
kubectl logs -f | grep sales_graph_quality_escalation
```

---

### Test 7: Errores de IA y Fallbacks

**Objetivo**: Verificar que el bot maneja fallos de IA elegantemente

**Pasos**:
1. Temporalmente usa una API key inválida o desconecta DeepSeek
2. Enviar cualquier mensaje
3. Verificar que el bot usa fallback estático

**Resultado Esperado**:
- ✅ Loggea error de IA
- ✅ Usa fallback estático
- ✅ Conversación continúa sin romperse
- ✅ Reintenta antes de hacer fallback

**Ver Logs**:
```bash
kubectl logs -f | grep sales_graph_node_error
kubectl logs -f | grep sales_graph_.*_fallback
```

---

## Métricas a Monitorear

### 1. Precisión de Intent Classification
```bash
# Ver distribución de intents
kubectl logs | grep ai_intent_classification | jq '.intent' | sort | uniq -c

# Ver confianza promedio
kubectl logs | grep ai_intent_classification | jq '.confidence'
```

### 2. Tasa de Fallbacks
```bash
# Cuántas veces se usó fallback
kubectl logs | grep fallback | wc -l

# Comparado con total de mensajes
kubectl logs | grep sales_graph_transition | wc -l
```

### 3. Conversaciones Saludables
```bash
# Quality check results
kubectl logs | grep sales_graph_quality_check | jq '.isHealthy' | sort | uniq -c

# Escalaciones
kubectl logs | grep sales_graph_quality_escalation | wc -l
```

### 4. Errores y Reintentos
```bash
# Node errors
kubectl logs | grep sales_graph_node_error | wc -l

# Max retries exceeded
kubectl logs | grep sales_graph_node_max_retries_exceeded | wc -l
```

---

## Debugging Tips

### El bot repite el mismo mensaje

**Causa probable**: Dynamic response generator está fallando y usando fallback

**Solución**:
```bash
# Ver si hay errores de IA
kubectl logs | grep dynamic_response_generation_fallback

# Verificar que DeepSeek está configurado
kubectl get secret | grep DEEPSEEK_API_KEY
```

### El bot no entiende intents correctamente

**Causa probable**: IA no está clasificando o fallback regex es muy agresivo

**Solución**:
```bash
# Ver clasificación de intents
kubectl logs | grep ai_intent_classification

# Ver confidence scores
kubectl logs | grep ai_intent_classification | jq '.confidence'

# Si confidence es bajo (<0.6), el prompt puede necesitar ajustes
```

### LangGraph no se está usando

**Causa probable**: Feature flags no están configurados correctamente

**Solución**:
```bash
# Ver configuración actual
env | grep AI_SALES_LANGGRAPH

# Debería mostrar:
# AI_SALES_LANGGRAPH_ENABLED=true
# AI_SALES_LANGGRAPH_SHADOW_MODE=false
```

### Conversación se traba

**Causa probable**: Error en algún nodo del grafo

**Solución**:
```bash
# Ver errores de nodos
kubectl logs | grep sales_graph_node_error

# Ver el estado completo del grafo
kubectl logs | grep sales_graph_transition | tail -20
```

---

## Checklist de Producción

Antes de desplegar a producción:

- [ ] Variables de entorno configuradas
- [ ] DeepSeek API key válida
- [ ] Base de datos conectada (LangGraph checkpointer)
- [ ] Todos los servicios registrados en el módulo
- [ ] Tests 1-7 pasan localmente
- [ ] Logging configurado y visible
- [ ] Métricas de calidad monitoreadas
- [ ] Fallbacks funcionan sin API de IA
- [ ] Handoff a humano funciona
- [ ] PDF links se generan correctamente

---

## Ejemplos de Logs Esperados

### Transición Exitosa
```json
{
  "event": "sales_graph_transition",
  "conversationId": "573204051366",
  "traceId": "graph-573204051366-msg123",
  "fromNode": "load_context",
  "toNode": "classify_intent",
  "status": "success",
  "latencyMs": 45,
  "mode": "live"
}
```

### Clasificación de Intent
```json
{
  "event": "ai_intent_classification",
  "conversationId": "573204051366",
  "message": "quiero cotizar un proyecto",
  "intent": "new_project",
  "confidence": 0.92,
  "reasoning": "El usuario explícitamente menciona cotizar un proyecto"
}
```

### Quality Check
```json
{
  "event": "sales_graph_quality_check",
  "conversationId": "573204051366",
  "isHealthy": true,
  "issues": 0,
  "shouldEscalate": false,
  "recommendations": ["Conversación saludable - continuar normalmente"]
}
```

---

## Contacto

Si encuentras bugs o problemas:
1. Revisar logs con los comandos arriba
2. Verificar variables de entorno
3. Probar escenarios de test 1-7
4. Reportar con logs completos y escenario que falló
