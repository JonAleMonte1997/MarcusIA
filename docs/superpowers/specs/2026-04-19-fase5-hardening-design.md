# Fase 5: Hardening — Diseño

**Fecha:** 2026-04-19  
**Estado:** aprobado

## Resumen

Refactor de persistencia y observabilidad de Marcus. Dos objetivos principales:

1. **Memoria de dos capas**: contexto activo por sesión (corto plazo) + memoria semántica de facts (largo plazo).
2. **Logging estructurado y error handling claro** en todas las capas.

No se trabaja reconexión de Baileys en esta fase (el transporte de WhatsApp cambia pronto a número propio).

---

## Arquitectura general

Tres módulos nuevos/modificados, sin cambios al core de `WhatsappService`:

```
AppService (orquestador)
 ├── SessionService       ← NEW — sesión activa, expiración por timeout, cron de cierre
 ├── MemoryService        ← NEW — CRUD de memories, compactación, inyección en system prompt
 ├── ConversationService  ← MODIFY — opera sobre sesión activa en vez de historia global
 └── ClaudeService        ← MODIFY — recibe memories + historial de sesión
```

**Flujo por mensaje:**

```
WhatsApp msg
  → AppService.handle()
      → SessionService.getOrCreate(jid)          // sesión activa o nueva si expiró
      → ConversationService.getSession(sessionId) // mensajes de la sesión activa
      → MemoryService.getAll(jid)                // facts para system prompt
      → ClaudeService.chat(history, memories, text)
      → SessionService.touch(sessionId)           // actualiza lastActivityAt
      → ConversationService.save(sessionId, ...)  // persiste mensaje en sesión
```

---

## Sección 1: Gestión de sesión (`SessionService`)

### Schema Prisma

```prisma
model Session {
  id             String    @id @default(cuid())
  jid            String
  createdAt      DateTime  @default(now())
  lastActivityAt DateTime  @default(now())
  closedAt       DateTime?
  messages       Message[]
}

model Message {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  jid       String
  role      String
  content   String
  createdAt DateTime @default(now())
}
```

### Lógica

- `getOrCreate(jid)`: busca sesión abierta (`closedAt == null`). Si `lastActivityAt` supera `SESSION_TIMEOUT_HOURS` (env, default `6`), la cierra y crea una nueva. Si no existe ninguna, crea la primera.
- `touch(sessionId)`: actualiza `lastActivityAt = now()` tras cada mensaje.
- `close(sessionId)`: setea `closedAt = now()`. Llamado por el cron o por el cierre de sesión que dispara extracción de memoria.

### Expiración automática

Un `@Cron('0 * * * *')` (cada hora) en `SessionService` cierra sesiones cuyo `lastActivityAt` supera el timeout. Al cerrar, dispara extracción de memoria de esa sesión (ver Sección 2).

Sin comando manual de "nueva sesión" — el timeout configurable cubre todos los casos.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `SESSION_TIMEOUT_HOURS` | `6` | Horas de inactividad para cerrar sesión |

---

## Sección 2: Memoria semántica (`MemoryService`)

### Schema Prisma

```prisma
model Memory {
  id        String   @id @default(cuid())
  jid       String
  key       String
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([jid, key])
}
```

### Cómo se llena

**Camino 1 — instrucción explícita:**  
Claude tiene acceso a una tool `save_memory(key, value)` y una tool `delete_memory(key)`. Cuando el usuario dice "recordá que...", "siempre prefiero...", etc., Claude llama `save_memory`. Cuando dice "olvidate de...", llama `delete_memory`.

**Camino 2 — extracción al cerrar sesión:**  
Al cerrar una sesión (por cron o timeout), `MemoryService` hace una llamada liviana a Claude con los mensajes de esa sesión:

> *"Extraé máximo 3 facts nuevos o actualizados que valga la pena recordar de esta conversación. Devolvé JSON array `[{key, value}]` o `[]` si no hay nada relevante."*

Los facts resultantes se hacen upsert en la tabla `Memory`. Esta llamada es fire-and-forget — no bloquea ni el cron ni el flujo de mensajes del usuario.

### Inyección en system prompt

Todas las memories del JID se agregan al system prompt de Claude como bloque:

```
Lo que sé de vos:
- horario_reuniones: prefiero de mañana, antes de las 12
- proyecto_actual: Marcus IA, asistente personal en NestJS
```

### Compactación

- **Tope:** `MEMORY_MAX_ENTRIES` facts por JID (env, default `50`).
- **Trigger:** cuando `count >= MEMORY_MAX_ENTRIES` al hacer upsert.
- **Lógica:** se toman los **20 más viejos** (`updatedAt ASC`) y se mandan a Claude:
  > *"Compactalos en máximo 10, fusionando los relacionados y descartando los obsoletos. Devolvé JSON array `[{key, value}]`."*
- Los 30 más recientes no se tocan. El resultado reemplaza el subconjunto viejo.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `MEMORY_MAX_ENTRIES` | `50` | Tope de facts por JID antes de compactar |

---

## Sección 3: Logging y error handling

### Logging

`LOG_LEVEL` en env (`debug|info|warn|error`, default `info`). NestJS Logger nativo configurado en bootstrap:

```ts
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: resolveLogLevel(process.env.LOG_LEVEL),
});
```

| Evento | Nivel | Contexto incluido |
|---|---|---|
| Mensaje entrante | `info` | jid, texto truncado, sessionId |
| Llamada a Claude | `info` | model, nro mensajes, nro tools, nro memories |
| Tool ejecutada | `info` | tool name, resultado resumido |
| Sesión nueva/cerrada | `info` | jid, sessionId, motivo |
| Memory guardada/compactada | `info` | key, jid |
| Error en handler | `error` | jid, mensaje original, stack |
| Error en tool | `warn` | tool name, input, error message |
| Error en extracción de memory | `warn` | sessionId, error message |

### Error handling

- Cada capa lanza errores con contexto: `throw new Error(\`Tool ${name} falló: ${cause}\`)`.
- `AppService` tiene try/catch top-level: loguea con stack y responde al usuario con mensaje digno en vez de silencio.
- Errores de Claude API (rate limit, timeout) se distinguen de errores de tool para mensajes distintos al usuario.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `LOG_LEVEL` | `info` | Nivel de logging (`debug\|info\|warn\|error`) |

---

## Migración de base de datos

- La tabla `Message` existente se migra: se agrega columna `sessionId` (nullable inicialmente, luego required).
- Se crea una sesión "legacy" por JID para los mensajes históricos existentes.
- Se agregan tablas `Session` y `Memory`.
- Migración Prisma estándar (`prisma migrate dev`).

---

## Variables de entorno — resumen completo

| Variable | Default | Descripción |
|---|---|---|
| `LOG_LEVEL` | `info` | Nivel de logging |
| `SESSION_TIMEOUT_HOURS` | `6` | Horas de inactividad para nueva sesión |
| `MEMORY_MAX_ENTRIES` | `50` | Tope de facts antes de compactar |

---

## Fuera de scope (esta fase)

- Reconexión robusta de Baileys (el transporte cambia a número propio).
- Resumen narrativo de sesión al cerrar (puede agregarse como Fase 5b).
- Búsqueda semántica / vector store para memories (overkill para single-user).
