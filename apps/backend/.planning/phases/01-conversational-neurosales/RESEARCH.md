# Research: Neuroventas y Conversación Fluida para Bots Comerciales

## Problema Principal Identificado

El bot actual sufre de:
1. **Context rot**: No mantiene contexto de conversaciones previas cuando el usuario quiere reiniciar
2. **Mensajes robóticos**: Patrones repetitivos predecibles
3. **Falta de empatía**: No conecta emocionalmente con el cliente
4. **No maneja objeciones**: Respuestas genéricas a desvíos

---

## Neuroventas: Principios Aplicables

### 1. Reciprocidad (Cialdini)
**Concepto**: Dar valor antes de pedir algo.

**Aplicación en bot**:
- Ofrecer insight útil sobre el tipo de proyecto mencionado
- Compartir rango de precios orientativo cuando se menciona presupuesto
- Sugerir consideraciones técnicas que el cliente no pensó

**Ejemplo**:
```
Usuario: "Quiero una app tipo Uber para mascotas"

❌ "¿Cuál es tu presupuesto?"
✅ "Interesante modelo. Las apps de servicios locales suelen tener un desafío interesante: el matching en tiempo real. Depende mucho de si necesitas tracking GPS en vivo o agendamiento. ¿Cómo lo visualizas tú?"
```

### 2. Autoridad
**Concepto**: Demostrar expertise crea confianza.

**Aplicación en bot**:
- Mencionar brevemente experiencia relevante
- Usar terminología apropiada al contexto
- Mostrar comprensión de la industria del cliente

**Ejemplo**:
```
"Hemos trabajado en varios marketplaces de servicios locales. Lo que suele definir el éxito es..."
```

### 3. Compromiso y Consistencia
**Concepto**: Pequeños "síes" llevan a commits mayores.

**Aplicación en bot**:
- Validar lo que el cliente ya compartió
- Pedir confirmaciones pequeñas antes de grandes preguntas
- Reconocer progreso en el brief

**Ejemplo**:
```
"Perfecto, entonces el objetivo principal es X. ¿Correcto?"
"Veo que tienes claro el problema. Ahora, sobre la solución..."
```

### 4. Prueba Social
**Concepto**: Mostrar que otros han confiado.

**Aplicación en bot** (subtle):
```
"Es un tipo de proyecto que hacemos regularmente. Lo interesante es..."
"Suele ser un proceso de 2-3 semanas según la complejidad."
```

### 5. Escasez
**Concepto**: Lo limitado es más valioso.

**Aplicación en bot** (honesta, no manipuladora):
```
"Nuestro equipo está con disponibilidad para proyectos que arranquen en las próximas 3 semanas."
"Para esa fecha de entrega, necesitaríamos confirmar alcance esta semana."
```

### 6. Liking/Simpatía
**Concepto**: Compramos de quien nos cae bien.

**Aplicación en bot**:
- Tono conversacional, no corporativo
- Reconocer el esfuerzo del cliente
- Validar la visión/proyecto

---

## Patrones de Conversación Natural

### Estructura de Mensaje Efectivo

```
[ACK] + [VALUE/BRIDGE] + [QUESTION]

ACK: Reconocer lo que dijo el cliente
VALUE/BRIDGE: Agregar valor o transición suave
QUESTION: Una sola pregunta clara
```

**Ejemplo**:
```
Usuario: "Es una app para veterinarias"

❌ "¿Cuál es el problema principal?"

✅ "Vale, entonces es un marketplace B2B2C — veterinarias ofrecen servicios y dueños de mascotas los contratan. El desafío suele ser el onboarding de los primeros proveedores. ¿Ya tienes veterinarias interesadas o estamos validando el modelo?"
```

### Anti-Patrones a Eliminar

1. **"Perfecto" en cada mensaje** → Variar: "Vale", "Entiendo", "Claro", "Interesante", "Suena bien"

2. **Preguntas en lista** → Una a la vez, con contexto

3. **Ignorar emoción** → Reconocer: "Suena ambicioso", "Entiendo la urgencia", "Tiene sentido"

4. **Saltar a cotizar sin brief** → Profundizar antes de prometer

---

## Manejo de Objeciones Comunes

### "Es muy caro" / Presupuesto temprano
```
❌ "¿Cuál es tu presupuesto?"

✅ "Entiendo que el precio es importante. Depende mucho del alcance — desde un MVP enfocado hasta una versión full. ¿Qué tan definido tienes qué funcionalidad es crítica para el lanzamiento?"
```

### "Necesito pensarlo"
```
❌ "Ok, avísame cuando decidas"

✅ "Claro, es una decisión importante. ¿Hay algún punto específico que te genere duda? A veces aclarar un detalle técnico ayuda a visualizar mejor."
```

### "Voy a comparar opciones"
```
❌ "Está bien"

✅ "Tiene sentido comparar. Algo que suele diferenciarnos es que trabajamos con metodología de MVP — validamos hipótesis rápido sin sobre-ingeniería. ¿Ese approach te funciona o buscas algo más estructurado?"
```

### Cambio de tema
```
❌ "Volvamos al tema principal"

✅ "Me parece bien hablar de eso. ¿Es parte del mismo proyecto o es algo aparte que también estás evaluando?"
```

---

## Variantes de Mensajes: Estrategia

### Problema con Mensajes Estáticos
- Predecibles → aburrimiento
- No adaptan a contexto → irrelevantes
- Robóticos → desconfianza

### Solución: Sistema de Variantes

```typescript
// 5+ variantes por escenario, seleccionadas por hash/turno
const VARIANTS = {
  greeting_first_contact: [
    "¿Qué proyecto tienes en mente?",
    "¡Hola! Cuéntame sobre tu proyecto",
    "¿Buscas cotizar algo o conocer cómo trabajamos primero?",
    "¿Qué necesitas construir? Me interesa escuchar.",
    "Hola — ¿qué proyecto te trae por aquí?",
  ],
  
  ready_for_quote: [
    "Perfecto, voy a preparar una propuesta preliminar para {projectType}...",
    "Ya tengo suficiente para armar un borrador. Te preparo algo en las próximas horas...",
    "Suena como un proyecto interesante. Voy a estructurar una propuesta...",
    "Entendido. Preparo un brief para que el equipo revise y te envíemos una propuesta...",
    "Tiene sentido. Voy a cotizar {projectType} con los datos que me diste...",
  ],
}
```

### Selección Inteligente
- Hash del conversationId → consistencia en reintentos
- Turno de conversación → variación progresiva
- Contexto → variantes relevantes al tipo de proyecto

---

## Memoria Conversacional: Qué Recordar

### Datos Estructurados (Brief)
- projectType, businessProblem, etc.

### Datos Contextuales (Nuevo)
- `previousTopics`: Temas mencionados
- `customerTone`: formal/casual/técnico
- `expressedConcerns`: Preocupaciones/objeciones
- `enthusiasmLevel`: bajo/medio/alto
- `decisionUrgency`: inmediata/medio/largo plazo
- `technicalLevel`: no-técnico/alguno/experto

### Uso en Prompts
```
Contexto de esta conversación:
- Cliente mencionó previamente: {previousTopics}
- Tono detectado: {customerTone}
- Preocupaciones expresadas: {expressedConcerns}

Instrucciones:
- Adapta tu lenguaje al tono del cliente
- Si el cliente mostró preocupación por X, abórdala proactivamente
- Refencia temas previos cuando sea natural
```

---

## Referencias

- Cialdini, R. "Influence: The Psychology of Persuasion"
- ChatGPT/LaMDA best practices for conversational AI
- WhatsApp Business API: conversational design patterns
- Intercom/Drift: B2B bot conversation flows

---

## Métricas de Éxito

- **Engagement**: % de usuarios que completan brief
- **Conversion**: % de briefs que generan cotización enviada
- **Satisfaction**: Feedback de usuarios (NPS implícito)
- **Human handoff rate**: Cuántos piden hablar con humano (target: <20%)
