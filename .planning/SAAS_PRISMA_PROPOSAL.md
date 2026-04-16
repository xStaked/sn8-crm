# SAAS_PRISMA_PROPOSAL

## Propósito

Proponer la evolución del schema Prisma actual de `sn8-crm` para soportar multi-tenancy SaaS en Fase 01, sin convertir esta fase en una reescritura masiva.

El objetivo de esta propuesta es:
- fijar el modelo target
- definir estrategia de migración incremental
- minimizar riesgo sobre el sistema actual
- preparar Fase 02 y siguientes

---

## 1. Estado actual resumido

El schema actual expone un núcleo todavía single-tenant:
- `User`
- `Message`
- `CommercialBrief`
- `QuoteDraft`
- `QuoteReviewEvent`

### Problemas estructurales del schema actual
- no existe `Workspace`
- no existe `Conversation` formal
- no existe `workspaceId` en entidades core
- `CommercialBrief` está demasiado acoplado al caso de venta de software
- el dominio de cotización ocupa el centro del esquema
- `Message` no está anclado a una conversación explícita ni a tenant explícito

---

## 2. Principios de diseño para la migración

1. No romper de inmediato los flujos operativos actuales.
2. Introducir nuevas entidades base antes de renombrar o deprecar las actuales.
3. Preferir migración aditiva en Fase 01.
4. Hacer tenancy explícita en los modelos principales.
5. Separar el módulo de offers del core incluso si al inicio comparten base de datos.
6. Permitir convivencia temporal entre modelo legacy y modelo target.

---

## 3. Modelo target mínimo para Fase 01

## Nuevos enums recomendados

```prisma
enum WorkspaceMemberRole {
  owner
  admin
  operator
  reviewer
}

enum BotStatus {
  draft
  active
  paused
  archived
}

enum ChannelType {
  whatsapp
  instagram
  webchat
}

enum ChannelConnectionStatus {
  draft
  active
  error
  disconnected
}

enum ConversationStatus {
  open
  waiting_customer
  waiting_human
  closed
}

enum LeadStatus {
  new
  qualified
  unqualified
  won
  lost
}
```

---

## Nuevos modelos core

### Workspace
```prisma
model Workspace {
  id          String            @id @default(cuid())
  name        String
  slug        String            @unique
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  members            WorkspaceMember[]
  bots               Bot[]
  channelConnections ChannelConnection[]
  conversations      Conversation[]
  leads              Lead[]
  messages           Message[]
}
```

### WorkspaceMember
```prisma
model WorkspaceMember {
  id          String              @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceMemberRole @default(operator)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([userId])
}
```

### Bot
```prisma
model Bot {
  id          String    @id @default(cuid())
  workspaceId String
  name        String
  slug        String
  status      BotStatus @default(draft)
  persona     Json?
  settings    Json?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channelConnections ChannelConnection[]
  conversations      Conversation[]

  @@unique([workspaceId, slug])
  @@index([workspaceId, status])
}
```

### ChannelConnection
```prisma
model ChannelConnection {
  id             String                  @id @default(cuid())
  workspaceId    String
  botId          String?
  type           ChannelType
  name           String
  externalRef    String?
  status         ChannelConnectionStatus @default(draft)
  credentials    Json?
  settings       Json?
  createdAt      DateTime                @default(now())
  updatedAt      DateTime                @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  bot       Bot?      @relation(fields: [botId], references: [id], onDelete: SetNull)
  conversations Conversation[]

  @@index([workspaceId, type, status])
}
```

### Conversation
```prisma
model Conversation {
  id                  String             @id @default(cuid())
  workspaceId         String
  botId               String?
  channelConnectionId String?
  externalThreadKey   String?
  customerPhone       String
  customerName        String?
  status              ConversationStatus @default(open)
  lastMessageAt       DateTime?
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  workspace         Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  bot               Bot?               @relation(fields: [botId], references: [id], onDelete: SetNull)
  channelConnection ChannelConnection? @relation(fields: [channelConnectionId], references: [id], onDelete: SetNull)
  messages          Message[]
  lead              Lead?
  commercialBrief   CommercialBrief?

  @@unique([workspaceId, customerPhone])
  @@index([workspaceId, status, lastMessageAt])
  @@index([channelConnectionId])
}
```

### Lead
```prisma
model Lead {
  id              String     @id @default(cuid())
  workspaceId     String
  conversationId  String?    @unique
  status          LeadStatus @default(new)
  fullName        String?
  phone           String?
  email           String?
  source          String?
  qualification   Json?
  profile         Json?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  workspace    Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)

  @@index([workspaceId, status, createdAt])
}
```

---

## 4. Cambios propuestos a modelos existentes

## User

### Estado
Modelo global válido.

### Cambio propuesto
Agregar relación a `WorkspaceMember`.

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships WorkspaceMember[]
}
```

---

## Message

### Estado
Existe como registro plano con `fromPhone`, `toPhone`, `channel`, `rawPayload`.

### Problema
No tiene tenancy ni conversación explícita.

### Cambio propuesto
Volverlo tenant-aware y conversation-aware.

```prisma
model Message {
  id                  String   @id @default(cuid())
  workspaceId         String
  conversationId      String
  botId               String?
  channelConnectionId String?
  externalMessageId   String   @unique
  direction           String
  fromPhone           String
  toPhone             String
  body                String?
  channel             String   @default("whatsapp")
  rawPayload          Json
  processedAt         DateTime?
  createdAt           DateTime @default(now())

  workspace    Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversation Conversation       @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  bot          Bot?               @relation(fields: [botId], references: [id], onDelete: SetNull)
  channelConn  ChannelConnection? @relation(fields: [channelConnectionId], references: [id], onDelete: SetNull)

  @@index([workspaceId, createdAt])
  @@index([conversationId, createdAt])
}
```

### Nota de migración
Este es uno de los cambios más sensibles. No debería aplicarse en un único salto sin primero crear `Workspace` y `Conversation`.

---

## CommercialBrief

### Estado
Actualmente contiene el brief estructurado del proyecto.

### Problema
Está rígidamente orientado a venta de software y depende de `conversationId` como string único, no como relación formal.

### Cambio propuesto de transición
Mantenerlo temporalmente, pero:
- agregar `workspaceId`
- agregar `conversationRefId` hacia `Conversation`
- permitir transición futura a `Lead.profile`

```prisma
model CommercialBrief {
  id               String                @id @default(cuid())
  workspaceId      String
  conversationId   String                @unique
  conversationRefId String?
  status           CommercialBriefStatus @default(collecting)
  customerName     String?
  projectType      String?
  businessProblem  String?
  desiredScope     String?
  budget           String?
  urgency          String?
  constraints      String?
  summary          String?
  sourceTranscript Json?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt

  workspace      Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversation   Conversation? @relation(fields: [conversationRefId], references: [id], onDelete: SetNull)
  quoteDrafts    QuoteDraft[]

  @@index([workspaceId, status])
  @@index([conversationRefId])
}
```

### Decisión recomendada
No renombrarlo todavía en la primera migración física. Primero hay que estabilizar tenancy y conversación.

---

## QuoteDraft

### Estado
Es útil, pero pertenece al dominio opcional de offers.

### Cambio propuesto de transición
Agregar `workspaceId` y preparar rename conceptual futuro.

```prisma
model QuoteDraft {
  id                    String            @id @default(cuid())
  workspaceId           String
  commercialBriefId     String
  conversationId        String
  version               Int
  origin                QuoteDraftOrigin  @default(initial)
  reviewStatus          QuoteReviewStatus @default(pending_owner_review)
  templateVersion       String?
  draftPayload          Json
  renderedQuote         String?
  ownerFeedbackSummary  String?
  approvedAt            DateTime?
  deliveredToCustomerAt DateTime?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  workspace         Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  commercialBrief   CommercialBrief @relation(fields: [commercialBriefId], references: [id], onDelete: Cascade)
  reviewEvents      QuoteReviewEvent[]

  @@unique([conversationId, version])
  @@index([workspaceId, reviewStatus, createdAt])
  @@index([commercialBriefId, version])
}
```

---

## QuoteReviewEvent

### Cambio propuesto
Agregar `workspaceId` para hacer consultas y policies por tenant.

```prisma
model QuoteReviewEvent {
  id             String            @id @default(cuid())
  workspaceId    String
  quoteDraftId   String
  conversationId String
  iteration      Int
  reviewStatus   QuoteReviewStatus
  feedback       String
  createdAt      DateTime          @default(now())
  resolvedAt     DateTime?

  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  quoteDraft  QuoteDraft @relation(fields: [quoteDraftId], references: [id], onDelete: Cascade)

  @@unique([quoteDraftId, iteration])
  @@index([workspaceId, createdAt])
  @@index([conversationId, createdAt])
}
```

---

## 5. Orden recomendado de migración

## Paso 1
Crear entidades nuevas sin romper el modelo actual:
- `Workspace`
- `WorkspaceMember`
- `Bot`
- `ChannelConnection`
- `Conversation`
- `Lead`

## Paso 2
Agregar columnas nullable de tenancy a entidades existentes:
- `Message.workspaceId`
- `Message.conversationId`
- `CommercialBrief.workspaceId`
- `CommercialBrief.conversationRefId`
- `QuoteDraft.workspaceId`
- `QuoteReviewEvent.workspaceId`

## Paso 3
Backfill inicial:
- crear un `Workspace` default para SN8 Labs
- asociar datos existentes a ese workspace
- materializar `Conversation` a partir de identidades telefónicas y/o ids estables actuales
- enlazar `Message`, `CommercialBrief`, `QuoteDraft` y `QuoteReviewEvent`

## Paso 4
Endurecer restricciones:
- volver obligatorios los `workspaceId` críticos
- volver obligatorio `Message.conversationId`
- agregar índices compuestos tenant-aware

## Paso 5
Mover código de aplicación a tenancy explícita.

## Paso 6
Renombre conceptual y eventual refactor físico del módulo de offers.

---

## 6. Estrategia para el default tenant inicial

Para evitar una migración disruptiva, la primera implementación debe crear un workspace seed tipo:

- `name`: `SN8 Labs`
- `slug`: `sn8-labs`

Luego:
- asociar usuarios actuales como `owner/admin`
- asociar conversaciones y mensajes existentes a ese workspace
- mantener el sistema actual operando sobre ese tenant único mientras se completa la refactorización

Esto permite una transición realista de single-tenant a multi-tenant sin freeze prolongado.

---

## 7. Riesgos técnicos principales

## Riesgo 1
`Message.externalMessageId` hoy es globalmente único; al crecer multi-tenant puede mantenerse así si el proveedor lo garantiza, pero conviene validar si debe pasar a índice compuesto por canal.

## Riesgo 2
La unicidad `Conversation.workspaceId + customerPhone` es útil para WhatsApp-first, pero puede requerir refinamiento si un mismo lead interactúa por múltiples canales.

## Riesgo 3
`CommercialBrief.conversationId` y `QuoteDraft.conversationId` hoy son strings operativos; cambiar a relaciones formales exige revisar servicios, colas y queries.

## Riesgo 4
Guardar `credentials` como JSON en `ChannelConnection` es práctico para MVP, pero después puede requerir cifrado y separación más fuerte.

---

## 8. Recomendación concreta de Fase 01

La Fase 01 no debería cerrar con la migración completa ya aplicada, sino con:

1. schema target definido
2. orden de migración definido
3. decisión de tenancy fijada
4. plan de backfill claro
5. backlog de implementación listo para ejecutar

---

## 9. Backlog técnico inicial derivado

## Backend / Prisma
1. crear migración aditiva con `Workspace`, `WorkspaceMember`, `Bot`, `ChannelConnection`, `Conversation`, `Lead`
2. sembrar workspace default `SN8 Labs`
3. agregar `workspaceId` nullable a modelos legacy
4. agregar `conversationId` relacional a `Message`
5. crear script de backfill legacy → workspace/conversation

## Backend / Aplicación
6. introducir `WorkspaceContext` en auth/session
7. hacer tenancy-aware `ConversationsService`
8. hacer tenancy-aware `MessageProcessor`
9. desacoplar pipeline de quotes del core conversacional

## Frontend
10. introducir noción de workspace actual en app shell
11. preparar navegación SaaS core vs offers
12. mantener compatibilidad temporal con CRM actual mientras migra el backend

---

## 10. Conclusión

La evolución correcta del schema Prisma no es renombrar todo de una vez. Es crear primero el núcleo multi-tenant y después absorber el modelo legacy dentro de ese nuevo centro.

La secuencia recomendada es:

`Workspace → Conversation → tenancy explícita → backfill → refactor de servicios → desacople de offers`

Esa secuencia reduce riesgo, preserva continuidad operativa y deja la base lista para que Fase 02 construya Knowledge y Bot Management sobre un dominio correcto.
