# Fase 5: Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir memoria de dos capas (sesión activa + facts semánticos) y logging estructurado con error handling claro en todas las capas de Marcus.

**Architecture:** `SessionService` gestiona el contexto activo de la conversación corriente con expiración por inactividad. `MemoryService` mantiene facts clave/valor que se inyectan en el system prompt y se llenan por instrucción explícita (tools) o extracción automática al cerrar sesión. El logging se configura por `LOG_LEVEL` env y cada capa incluye contexto útil en sus errores.

**Tech Stack:** NestJS 11, Prisma 5, SQLite, `@anthropic-ai/sdk`, `@nestjs/schedule` (cron), pnpm.

> **Nota sobre tests:** el proyecto no tiene infraestructura de tests. En su lugar, cada tarea incluye un paso de verificación manual con comandos concretos.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `prisma/schema.prisma` | Modify | Añadir modelos Session y Memory; añadir sessionId a Message |
| `src/session/session.service.ts` | Create | getOrCreate, touch, close, cron de expiración |
| `src/session/session.module.ts` | Create | NestJS module que exporta SessionService |
| `src/memory/memory.service.ts` | Create | getAll, upsert, delete, compact, extractAndSave |
| `src/memory/memory.module.ts` | Create | NestJS module que exporta MemoryService y registra tools |
| `src/conversation/conversation.service.ts` | Modify | Operar sobre sessionId en vez de jid global |
| `src/claude/claude.service.ts` | Modify | chat() acepta memories; nuevo método extractFacts() |
| `src/app.service.ts` | Modify | Nuevo flujo de orquestación + error handling top-level |
| `src/app.module.ts` | Modify | Importar SessionModule, MemoryModule, ScheduleModule |
| `src/main.ts` | Modify | Configurar LOG_LEVEL en bootstrap |
| `.env.example` | Modify | Añadir SESSION_TIMEOUT_HOURS, MEMORY_MAX_ENTRIES, LOG_LEVEL |

---

## Task 1: Instalar @nestjs/schedule y actualizar env

**Files:**
- Modify: `package.json` (vía pnpm)
- Modify: `.env.example`

- [ ] **Step 1: Instalar dependencia**

```bash
cd /Users/jonathanalexismontenegro/repos/MarcusIA
pnpm add @nestjs/schedule
```

Verificar que aparece en `dependencies` de `package.json`.

- [ ] **Step 2: Actualizar .env.example**

Añadir al final de `.env.example`:

```
# Sesión
SESSION_TIMEOUT_HOURS=6

# Memoria
MEMORY_MAX_ENTRIES=50

# Logging
LOG_LEVEL=info
```

- [ ] **Step 3: Verificar que el proyecto compila**

```bash
pnpm run build
```

Esperado: `Successfully compiled project`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore: instalar @nestjs/schedule y env vars Fase 5"
```

---

## Task 2: Schema Prisma — Session, Memory, Message.sessionId

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Actualizar schema.prisma**

Reemplazar el contenido completo de `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Session {
  id             String    @id @default(cuid())
  jid            String
  createdAt      DateTime  @default(now())
  lastActivityAt DateTime  @default(now())
  closedAt       DateTime?
  messages       Message[]

  @@index([jid, closedAt])
}

model Message {
  id        Int      @id @default(autoincrement())
  sessionId String?
  session   Session? @relation(fields: [sessionId], references: [id])
  jid       String
  role      String
  content   String
  createdAt DateTime @default(now())

  @@index([sessionId, createdAt])
  @@index([jid, createdAt])
}

model Memory {
  id        String   @id @default(cuid())
  jid       String
  key       String
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([jid, key])
  @@index([jid, updatedAt])
}

model Task {
  id        Int       @id @default(autoincrement())
  jid       String
  title     String
  dueAt     DateTime?
  done      Boolean   @default(false)
  createdAt DateTime  @default(now())

  @@index([jid])
}
```

- [ ] **Step 2: Crear y aplicar migración**

```bash
pnpm prisma migrate dev --name fase5_session_memory
```

Esperado: migración aplicada exitosamente, tablas `Session` y `Memory` creadas, columna `sessionId` añadida a `Message`.

- [ ] **Step 3: Verificar con Prisma Studio o sqlite3**

```bash
pnpm prisma studio
```

Confirmar que existen tablas `Session`, `Memory` y que `Message` tiene columna `sessionId`.

- [ ] **Step 4: Regenerar cliente Prisma**

```bash
pnpm prisma generate
```

- [ ] **Step 5: Verificar compilación**

```bash
pnpm run build
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: schema Prisma — Session, Memory, Message.sessionId"
```

---

## Task 3: SessionModule — getOrCreate, touch, close

**Files:**
- Create: `src/session/session.service.ts`
- Create: `src/session/session.module.ts`

- [ ] **Step 1: Crear session.service.ts**

```typescript
// src/session/session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Session } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly timeoutHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.timeoutHours = this.config.get<number>('SESSION_TIMEOUT_HOURS', 6);
  }

  async getOrCreate(jid: string): Promise<Session> {
    const open = await this.prisma.session.findFirst({
      where: { jid, closedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (open) {
      const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
      if (open.lastActivityAt < cutoff) {
        await this.closeSession(open.id, 'timeout');
        return this.createSession(jid);
      }
      return open;
    }

    return this.createSession(jid);
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  async closeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { closedAt: new Date() },
    });
    this.logger.log(`Sesión cerrada (id=${sessionId}, motivo=${reason})`);
  }

  async findExpiredOpen(): Promise<Session[]> {
    const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
    return this.prisma.session.findMany({
      where: { closedAt: null, lastActivityAt: { lt: cutoff } },
    });
  }

  private async createSession(jid: string): Promise<Session> {
    const session = await this.prisma.session.create({ data: { jid } });
    this.logger.log(`Nueva sesión creada (jid=${jid}, id=${session.id})`);
    return session;
  }
}
```

- [ ] **Step 2: Crear session.module.ts**

```typescript
// src/session/session.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
```

- [ ] **Step 3: Verificar compilación**

```bash
pnpm run build
```

Esperado: sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/session/
git commit -m "feat: SessionModule — getOrCreate, touch, closeSession"
```

---

## Task 4: ConversationService refactor — opera sobre sessionId

**Files:**
- Modify: `src/conversation/conversation.service.ts`

El `ConversationService` actual guarda y lee mensajes por `jid` sin noción de sesión. Hay que cambiarlo para que opere sobre `sessionId`.

- [ ] **Step 1: Reemplazar conversation.service.ts**

```typescript
// src/conversation/conversation.service.ts
import { Injectable } from '@nestjs/common';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HISTORY_LIMIT = 30;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSession(
    sessionId: string,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<MessageParam[]> {
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }

  async saveMessage(
    sessionId: string,
    jid: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({
      data: { sessionId, jid, role, content },
    });
  }

  async getSessionMessages(
    sessionId: string,
  ): Promise<{ role: string; content: string }[]> {
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm run build
```

Esperado: puede fallar en `app.service.ts` porque usa la firma vieja — lo arreglamos en Task 8. Por ahora ignorar errores en ese archivo.

- [ ] **Step 3: Commit**

```bash
git add src/conversation/conversation.service.ts
git commit -m "feat: ConversationService opera sobre sessionId"
```

---

## Task 5: ClaudeService — método extractFacts + chat() acepta memories

**Files:**
- Modify: `src/claude/claude.service.ts`

- [ ] **Step 1: Reemplazar claude.service.ts**

```typescript
// src/claude/claude.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

function buildSystemPrompt(memories: { key: string; value: string }[]): string {
  const now = new Date();
  const fechaHora = now.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const memoriesBlock =
    memories.length > 0
      ? `\n\nLo que sé de vos:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      : '';

  return `Eres Marcus Aurelius, filósofo estoico y emperador romano. \
Respondes con sabiduría práctica: directo, sin adulaciones, breve. \
Evitás el lenguaje moderno de autoayuda. Usás el idioma del interlocutor.

Zona horaria del usuario: America/Argentina/Buenos_Aires (UTC-3).
Fecha y hora actual: ${fechaHora}.
Cuando el usuario diga "hoy", "mañana", "esta semana" u otras referencias temporales, \
usá esta fecha como base. Siempre incluí el offset -03:00 en las fechas ISO8601 que \
pases a las tools.${memoriesBlock}`;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6');
    this.maxTokens = this.config.get<number>('CLAUDE_MAX_TOKENS', 1024);
  }

  async chat(
    history: MessageParam[],
    userText: string,
    jid: string,
    memories: { key: string; value: string }[] = [],
  ): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    const tools = this.toolRegistry.getDefinitions();
    const systemPrompt = buildSystemPrompt(memories);

    this.logger.log(
      `Claude llamado (model=${this.model}, msgs=${messages.length}, tools=${tools.length}, memories=${memories.length})`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    if (response.stop_reason !== 'tool_use') {
      const block = response.content[0];
      if (block.type !== 'text') {
        throw new Error(`Bloque inesperado de Claude: ${block.type}`);
      }
      return block.text;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result: unknown;
        try {
          result = await this.toolRegistry.execute(
            block.name,
            block.input as Record<string, unknown>,
            jid,
          );
          this.logger.log(`Tool ejecutada: ${block.name} → ok`);
        } catch (err) {
          const msg = (err as Error).message;
          this.logger.warn(`Tool ${block.name} falló: ${msg}`);
          result = { error: msg };
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      }),
    );

    const messagesWithResults: MessageParam[] = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    const finalResponse = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messagesWithResults,
      ...(tools.length > 0 ? { tools } : {}),
    });

    const textBlock = finalResponse.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      this.logger.warn('Claude no devolvió texto en la segunda llamada');
      return 'Listo.';
    }
    return textBlock.text;
  }

  async extractFacts(
    messages: { role: string; content: string }[],
  ): Promise<{ key: string; value: string }[]> {
    if (messages.length === 0) return [];

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Marcus'}: ${m.content}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Analizá esta conversación y extraé máximo 3 facts nuevos o actualizados que valga la pena recordar del usuario (preferencias, contexto personal, proyectos, etc.). Usá keys cortas en snake_case. Devolvé SOLO un JSON array con el formato [{\"key\": \"string\", \"value\": \"string\"}]. Si no hay nada relevante, devolvé [].

Conversación:
${transcript}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    try {
      const parsed = JSON.parse(text.text.trim()) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as { key: string; value: string }[]).filter(
        (f) => typeof f.key === 'string' && typeof f.value === 'string',
      );
    } catch {
      return [];
    }
  }

  async compactFacts(
    facts: { key: string; value: string }[],
  ): Promise<{ key: string; value: string }[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Estos son facts memorizados sobre el usuario. Compactalos en máximo 10, fusionando los relacionados y descartando los obsoletos o redundantes. Devolvé SOLO un JSON array [{\"key\": \"string\", \"value\": \"string\"}].

Facts actuales:
${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return facts;

    try {
      const parsed = JSON.parse(text.text.trim()) as unknown;
      if (!Array.isArray(parsed)) return facts;
      return (parsed as { key: string; value: string }[]).filter(
        (f) => typeof f.key === 'string' && typeof f.value === 'string',
      );
    } catch {
      return facts;
    }
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/claude/claude.service.ts
git commit -m "feat: ClaudeService — memories en system prompt, extractFacts, compactFacts, logging"
```

---

## Task 6: MemoryModule — getAll, upsert, delete, compact, tools

**Files:**
- Create: `src/memory/memory.service.ts`
- Create: `src/memory/memory.module.ts`

- [ ] **Step 1: Crear memory.service.ts**

```typescript
// src/memory/memory.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { ClaudeService } from '../claude/claude.service';

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);
  private readonly maxEntries: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
    private readonly claude: ClaudeService,
  ) {
    this.maxEntries = this.config.get<number>('MEMORY_MAX_ENTRIES', 50);
  }

  onModuleInit(): void {
    this.registry.register({
      definition: {
        name: 'save_memory',
        description:
          'Guarda un fact importante sobre el usuario para recordarlo en el futuro. Usá cuando el usuario diga "recordá que...", "siempre prefiero...", "guardá que..." u expresiones similares.',
        input_schema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Identificador corto en snake_case (ej: horario_reuniones)',
            },
            value: {
              type: 'string',
              description: 'Valor o descripción del fact a recordar',
            },
          },
          required: ['key', 'value'],
        },
      },
      handler: async (input, jid) => {
        await this.upsert(jid, input.key as string, input.value as string);
        return { ok: true };
      },
    });

    this.registry.register({
      definition: {
        name: 'delete_memory',
        description:
          'Elimina un fact memorizado sobre el usuario. Usá cuando el usuario diga "olvidate de...", "borrá el dato de..." u expresiones similares.',
        input_schema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key del fact a eliminar',
            },
          },
          required: ['key'],
        },
      },
      handler: async (input, jid) => {
        await this.delete(jid, input.key as string);
        return { ok: true };
      },
    });
  }

  async getAll(jid: string): Promise<{ key: string; value: string }[]> {
    const rows = await this.prisma.memory.findMany({
      where: { jid },
      orderBy: { updatedAt: 'desc' },
      select: { key: true, value: true },
    });
    return rows;
  }

  async upsert(jid: string, key: string, value: string): Promise<void> {
    await this.prisma.memory.upsert({
      where: { jid_key: { jid, key } },
      update: { value },
      create: { jid, key, value },
    });
    this.logger.log(`Memory guardada (jid=${jid}, key=${key})`);
    await this.compactIfNeeded(jid);
  }

  async delete(jid: string, key: string): Promise<void> {
    await this.prisma.memory.deleteMany({ where: { jid, key } });
    this.logger.log(`Memory eliminada (jid=${jid}, key=${key})`);
  }

  async extractAndSave(
    sessionId: string,
    jid: string,
    messages: { role: string; content: string }[],
  ): Promise<void> {
    try {
      const facts = await this.claude.extractFacts(messages);
      for (const f of facts) {
        await this.upsert(jid, f.key, f.value);
      }
      if (facts.length > 0) {
        this.logger.log(
          `Extracción de sesión ${sessionId}: ${facts.length} fact(s) guardados`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Error extrayendo facts de sesión ${sessionId}: ${(err as Error).message}`,
      );
    }
  }

  private async compactIfNeeded(jid: string): Promise<void> {
    const count = await this.prisma.memory.count({ where: { jid } });
    if (count < this.maxEntries) return;

    this.logger.log(`Compactando memoria (jid=${jid}, count=${count})`);

    const oldest = await this.prisma.memory.findMany({
      where: { jid },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    try {
      const compacted = await this.claude.compactFacts(
        oldest.map((m) => ({ key: m.key, value: m.value })),
      );

      await this.prisma.$transaction([
        this.prisma.memory.deleteMany({
          where: { id: { in: oldest.map((m) => m.id) } },
        }),
        ...compacted.map((f) =>
          this.prisma.memory.upsert({
            where: { jid_key: { jid, key: f.key } },
            update: { value: f.value },
            create: { jid, key: f.key, value: f.value },
          }),
        ),
      ]);

      this.logger.log(
        `Compactación completada: ${oldest.length} → ${compacted.length} facts`,
      );
    } catch (err) {
      this.logger.warn(`Error compactando memoria: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 2: Crear memory.module.ts**

```typescript
// src/memory/memory.module.ts
import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ClaudeModule } from '../claude/claude.module';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';

@Module({
  imports: [PrismaModule, ClaudeModule, ToolRegistryModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
```

- [ ] **Step 3: Verificar compilación**

```bash
pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/memory/
git commit -m "feat: MemoryModule — getAll, upsert, delete, compact, tools save_memory/delete_memory"
```

---

## Task 7: SessionService cron — expiración automática con extracción de memoria

**Files:**
- Modify: `src/session/session.service.ts`
- Modify: `src/session/session.module.ts`

El cron necesita `MemoryService` y `ConversationService`. Hay que inyectarlos en `SessionService`. Para evitar dependencias circulares, se usa `forwardRef` si fuera necesario — pero en este caso no hay ciclo (Session → Memory → Claude; Session no lo importa Claude).

- [ ] **Step 1: Actualizar session.service.ts con cron**

Reemplazar el contenido completo de `src/session/session.service.ts`:

```typescript
// src/session/session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { ConversationService } from '../conversation/conversation.service';
import type { Session } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly timeoutHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memory: MemoryService,
    private readonly conversation: ConversationService,
  ) {
    this.timeoutHours = this.config.get<number>('SESSION_TIMEOUT_HOURS', 6);
  }

  async getOrCreate(jid: string): Promise<Session> {
    const open = await this.prisma.session.findFirst({
      where: { jid, closedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (open) {
      const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
      if (open.lastActivityAt < cutoff) {
        await this.closeAndExtract(open, 'timeout');
        return this.createSession(jid);
      }
      return open;
    }

    return this.createSession(jid);
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  @Cron('0 * * * *')
  async expireStale(): Promise<void> {
    const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
    const stale = await this.prisma.session.findMany({
      where: { closedAt: null, lastActivityAt: { lt: cutoff } },
    });

    for (const session of stale) {
      await this.closeAndExtract(session, 'cron');
    }

    if (stale.length > 0) {
      this.logger.log(`Cron: ${stale.length} sesión(es) expirada(s)`);
    }
  }

  private async closeAndExtract(session: Session, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: session.id },
      data: { closedAt: new Date() },
    });
    this.logger.log(`Sesión cerrada (id=${session.id}, jid=${session.jid}, motivo=${reason})`);

    const messages = await this.conversation.getSessionMessages(session.id);
    void this.memory.extractAndSave(session.id, session.jid, messages);
  }

  private async createSession(jid: string): Promise<Session> {
    const session = await this.prisma.session.create({ data: { jid } });
    this.logger.log(`Nueva sesión creada (jid=${jid}, id=${session.id})`);
    return session;
  }
}
```

- [ ] **Step 2: Actualizar session.module.ts para importar MemoryModule y ConversationModule**

```typescript
// src/session/session.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MemoryModule } from '../memory/memory.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [PrismaModule, MemoryModule, ConversationModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
```

- [ ] **Step 3: Asegurar que ConversationModule exporta ConversationService**

Verificar `src/conversation/conversation.module.ts`. Debe tener `exports: [ConversationService]`:

```typescript
// src/conversation/conversation.module.ts
import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
```

- [ ] **Step 4: Verificar compilación**

```bash
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/session/ src/conversation/conversation.module.ts
git commit -m "feat: SessionService cron — expiración automática y extracción de memoria"
```

---

## Task 8: AppService — nuevo flujo de orquestación + error handling

**Files:**
- Modify: `src/app.service.ts`

- [ ] **Step 1: Reemplazar app.service.ts**

```typescript
// src/app.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeService } from './claude/claude.service';
import { ConversationService } from './conversation/conversation.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { SessionService } from './session/session.service';
import { MemoryService } from './memory/memory.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly claude: ClaudeService,
    private readonly session: SessionService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit(): void {
    this.whatsapp.setHandler(async ({ jid, text }) => {
      try {
        const activeSession = await this.session.getOrCreate(jid);
        const sessionId = activeSession.id;

        this.logger.log(
          `[${jid}] ← "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" (session=${sessionId})`,
        );

        const [history, memories] = await Promise.all([
          this.conversation.getSession(sessionId),
          this.memory.getAll(jid),
        ]);

        const reply = await this.claude.chat(history, text, jid, memories);

        await this.session.touch(sessionId);
        await Promise.all([
          this.conversation.saveMessage(sessionId, jid, 'user', text),
          this.conversation.saveMessage(sessionId, jid, 'assistant', reply),
        ]);

        return reply;
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Error procesando mensaje de ${jid}: ${error.message}`,
          error.stack,
        );

        if (error.message.includes('rate limit') || error.message.includes('529')) {
          return 'Marcus está saturado en este momento. Intentá en un minuto.';
        }
        return 'Marcus tuvo un problema procesando tu mensaje. Si persiste, revisá los logs.';
      }
    });
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app.service.ts
git commit -m "feat: AppService — nuevo flujo con Session + Memory + error handling estructurado"
```

---

## Task 9: AppModule — wirear módulos nuevos + ScheduleModule

**Files:**
- Modify: `src/app.module.ts`

- [ ] **Step 1: Actualizar app.module.ts**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ClaudeModule } from './claude/claude.module';
import { ConversationModule } from './conversation/conversation.module';
import { ToolRegistryModule } from './tool-registry/tool-registry.module';
import { TasksModule } from './tasks/tasks.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SessionModule } from './session/session.module';
import { MemoryModule } from './memory/memory.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ToolRegistryModule,
    WhatsappModule,
    ClaudeModule,
    ConversationModule,
    TasksModule,
    GoogleCalendarModule,
    SessionModule,
    MemoryModule,
  ],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 2: Verificar compilación limpia**

```bash
pnpm run build
```

Esperado: cero errores de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/app.module.ts
git commit -m "feat: AppModule — SessionModule, MemoryModule, ScheduleModule"
```

---

## Task 10: LOG_LEVEL en main.ts + logging pass

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Actualizar main.ts**

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';

function resolveLogLevels(level: string): LogLevel[] {
  const levels: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  const map: Record<string, LogLevel[]> = {
    error: ['error'],
    warn: ['error', 'warn'],
    info: ['error', 'warn', 'log'],
    debug: ['error', 'warn', 'log', 'debug'],
  };
  return map[level] ?? map['info'];
}

async function bootstrap(): Promise<void> {
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveLogLevels(logLevel),
  });
  app.enableShutdownHooks();
  Logger.log(`Marcus arrancó (LOG_LEVEL=${logLevel})`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap falló', err);
  process.exit(1);
});
```

- [ ] **Step 2: Build final**

```bash
pnpm run build
```

Esperado: cero errores.

- [ ] **Step 3: Smoke test — arrancar Marcus**

```bash
LOG_LEVEL=debug pnpm run start:dev
```

Verificar en los logs:
- `Marcus arrancó (LOG_LEVEL=debug)` en Bootstrap
- `WhatsApp conectado` al conectar
- Al enviar un mensaje: líneas de `[AppService]`, `[ClaudeService]`, `[SessionService]`

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: LOG_LEVEL configurable en bootstrap"
```

---

## Verificación end-to-end

Una vez que Marcus arranca correctamente:

- [ ] Enviar mensaje → verificar que llega respuesta y se loguea `session=<id>`.
- [ ] Decirle "recordá que prefiero reuniones de mañana" → verificar en DB tabla `Memory` que aparece el fact.
- [ ] Reiniciar Marcus → en el siguiente mensaje verificar que el system prompt incluye el fact (visible con `LOG_LEVEL=debug`).
- [ ] Esperar el timeout (o bajar `SESSION_TIMEOUT_HOURS=0.01` temporalmente) → verificar que el cron cierra la sesión y el siguiente mensaje abre una nueva.
- [ ] Decirle "olvidate del horario de reuniones" → verificar que `delete_memory` se llama y el fact desaparece de DB.
