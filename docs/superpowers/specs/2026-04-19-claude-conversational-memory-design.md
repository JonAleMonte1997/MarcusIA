# Fase 2: Claude + Memoria Conversacional Persistente

**Fecha:** 2026-04-19  
**Alcance:** Integrar Claude Sonnet al pipeline de WhatsApp con historial persistido por JID en SQLite.

---

## Arquitectura

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global)
├── WhatsappModule
│   └── WhatsappService       ← transporte puro, sin lógica de negocio
├── ClaudeModule
│   └── ClaudeService         ← llama a Anthropic API, arma el prompt
├── ConversationModule
│   └── ConversationService   ← persiste mensajes, recupera historial por JID
└── AppService (OnModuleInit) ← orquesta: inyecta los tres servicios y registra el handler
```

`AppService` implementa `OnModuleInit` y llama a `WhatsappService.setHandler()` con una función que orquesta `ConversationService` → `ClaudeService` → `ConversationService`.

---

## Modelo de datos (Prisma + SQLite)

```prisma
model Message {
  id        Int      @id @default(autoincrement())
  jid       String
  role      String   // "user" | "assistant"
  content   String   // texto plano en Fase 2; se migra a JSON en Fase 3 (tool use)
  createdAt DateTime @default(now())

  @@index([jid, createdAt])
}
```

El índice compuesto `[jid, createdAt]` hace eficiente la query de historial:  
`WHERE jid = ? ORDER BY createdAt DESC LIMIT 20`.

---

## ClaudeService

```typescript
class ClaudeService {
  chat(history: MessageParam[], userText: string): Promise<string>
}
```

- SDK: `@anthropic-ai/sdk`, modelo `claude-sonnet-4-6`
- System prompt embebido en el servicio (no en DB):
  > Eres Marcus Aurelius. Respondes con la sabiduría estoica de un filósofo romano: directo, sin adulaciones, breve. Usas el idioma del interlocutor.
- `max_tokens` configurable via `CLAUDE_MAX_TOKENS` en `.env` (default 1024)
- Recibe `history` ya como `MessageParam[]` — no consulta DB directamente

---

## ConversationService

```typescript
class ConversationService {
  getHistory(jid: string, limit?: number): Promise<MessageParam[]>
  saveMessage(jid: string, role: 'user' | 'assistant', content: string): Promise<void>
}
```

- `getHistory`: consulta los últimos `limit` (default 20) mensajes por JID, ordenados `ASC` (más viejo primero, que es lo que espera Claude en `messages[]`)
- `saveMessage`: persiste en la tabla `Message`

---

## Flujo completo

```
WhatsApp msg → AppService.handler(jid, text)
  1. ConversationService.saveMessage(jid, 'user', text)
  2. ConversationService.getHistory(jid)          → MessageParam[]
  3. ClaudeService.chat(history, text)             → reply: string
  4. ConversationService.saveMessage(jid, 'assistant', reply)
  5. return reply → WhatsappService envía al chat
```

---

## Variables de entorno nuevas

| Variable | Descripción | Default |
|---|---|---|
| `DATABASE_URL` | `file:./marcus.db` | requerido |
| `ANTHROPIC_API_KEY` | API key de Anthropic | requerido |
| `CLAUDE_MAX_TOKENS` | Límite de tokens de respuesta | `1024` |

---

## Dependencias nuevas

- `@prisma/client`, `prisma` (devDep)
- `@anthropic-ai/sdk`
- `@nestjs/prisma` o `PrismaModule` custom (patrón estándar NestJS)

---

## Fuera de alcance (Fase 3+)

- Tool use / ToolRegistry
- Streaming de respuestas
- Migración de `content` a JSON content-blocks
- Google Calendar integration
