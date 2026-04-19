# Tool Use — Tareas y Recordatorios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar tool use a Marcus para que Claude pueda crear, listar, editar, completar y eliminar tareas persistidas en SQLite.

**Architecture:** `ToolRegistryModule` global registra tools como handlers con su definición JSON Schema. `TasksService` se registra en el registry al init. `ClaudeService.chat()` pasa las tools al SDK, detecta `tool_use` en la respuesta, ejecuta los handlers via registry, y hace una segunda llamada para obtener la respuesta final en texto.

**Tech Stack:** NestJS 11, @anthropic-ai/sdk ^0.90, Prisma 5 + SQLite, TypeScript estricto.

---

## Archivos

| Archivo | Acción |
|---------|--------|
| `prisma/schema.prisma` | Modificar — agregar model `Task` |
| `src/tool-registry/tool-registry.service.ts` | Crear |
| `src/tool-registry/tool-registry.module.ts` | Crear |
| `src/tasks/tasks.service.ts` | Crear |
| `src/tasks/tasks.module.ts` | Crear |
| `src/claude/claude.service.ts` | Modificar — loop agentic + inyectar ToolRegistryService |
| `src/app.module.ts` | Modificar — importar ToolRegistryModule y TasksModule |
| `src/app.service.ts` | Modificar — pasar `jid` al llamado de `claude.chat()` |

---

### Task 1: Prisma — agregar model Task y migrar

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Agregar model Task al schema**

Reemplazar el contenido de `prisma/schema.prisma` con:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Message {
  id        Int      @id @default(autoincrement())
  jid       String
  role      String
  content   String
  createdAt DateTime @default(now())

  @@index([jid, createdAt])
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

- [ ] **Step 2: Generar la migración**

```bash
npx prisma migrate dev --name add-task
```

Salida esperada: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verificar que el cliente Prisma tiene Task**

```bash
npx prisma generate
```

Salida esperada: `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: agregar model Task a Prisma"
```

---

### Task 2: ToolRegistryModule

**Files:**
- Create: `src/tool-registry/tool-registry.service.ts`
- Create: `src/tool-registry/tool-registry.module.ts`

- [ ] **Step 1: Crear ToolRegistryService**

Crear `src/tool-registry/tool-registry.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export interface RegisteredTool {
  definition: Tool;
  handler: (input: Record<string, unknown>, jid: string) => Promise<unknown>;
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
    this.logger.debug(`Tool registrada: ${tool.definition.name}`);
  }

  getDefinitions(): Tool[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    jid: string,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool desconocida: ${name}`);
    return tool.handler(input, jid);
  }
}
```

- [ ] **Step 2: Crear ToolRegistryModule**

Crear `src/tool-registry/tool-registry.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';

@Global()
@Module({
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolRegistryModule {}
```

- [ ] **Step 3: Verificar compilación**

```bash
npx nest build 2>&1 | head -20
```

Salida esperada: sin errores (puede haber warnings de imports no usados aún, eso es OK).

- [ ] **Step 4: Commit**

```bash
git add src/tool-registry
git commit -m "feat: ToolRegistryModule — registro global de tools para Claude"
```

---

### Task 3: TasksModule — CRUD + registro de tools

**Files:**
- Create: `src/tasks/tasks.service.ts`
- Create: `src/tasks/tasks.module.ts`

- [ ] **Step 1: Crear TasksService**

Crear `src/tasks/tasks.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

@Injectable()
export class TasksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        name: 'create_task',
        description: 'Crea un recordatorio o tarea para el usuario.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título de la tarea' },
            due_at: {
              type: 'string',
              description: 'Fecha/hora límite en formato ISO8601 (opcional)',
            },
          },
          required: ['title'],
        },
      },
      handler: (input, jid) => this.createTask(jid, input),
    });

    this.registry.register({
      definition: {
        name: 'list_tasks',
        description: 'Lista las tareas del usuario.',
        input_schema: {
          type: 'object',
          properties: {
            include_done: {
              type: 'boolean',
              description: 'Incluir tareas ya completadas (default false)',
            },
          },
        },
      },
      handler: (input, jid) =>
        this.listTasks(jid, input.include_done as boolean | undefined),
    });

    this.registry.register({
      definition: {
        name: 'complete_task',
        description: 'Marca una tarea como completada.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.completeTask(input.id as number),
    });

    this.registry.register({
      definition: {
        name: 'edit_task',
        description: 'Edita el título o la fecha límite de una tarea.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
            title: { type: 'string', description: 'Nuevo título (opcional)' },
            due_at: {
              type: 'string',
              description: 'Nueva fecha límite en ISO8601 (opcional)',
            },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.editTask(input.id as number, input),
    });

    this.registry.register({
      definition: {
        name: 'delete_task',
        description: 'Elimina una tarea.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.deleteTask(input.id as number),
    });
  }

  async createTask(
    jid: string,
    input: Record<string, unknown>,
  ): Promise<{ id: number }> {
    const task = await this.prisma.task.create({
      data: {
        jid,
        title: input.title as string,
        dueAt: input.due_at ? new Date(input.due_at as string) : null,
      },
    });
    return { id: task.id };
  }

  async listTasks(
    jid: string,
    includeDone = false,
  ): Promise<
    { id: number; title: string; due_at: string | null; done: boolean }[]
  > {
    const tasks = await this.prisma.task.findMany({
      where: { jid, ...(includeDone ? {} : { done: false }) },
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      due_at: t.dueAt?.toISOString() ?? null,
      done: t.done,
    }));
  }

  async completeTask(id: number): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.update({ where: { id }, data: { done: true } });
    return { ok: true, id };
  }

  async editTask(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title as string } : {}),
        ...(input.due_at !== undefined
          ? { dueAt: input.due_at ? new Date(input.due_at as string) : null }
          : {}),
      },
    });
    return { ok: true, id };
  }

  async deleteTask(id: number): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.delete({ where: { id } });
    return { ok: true, id };
  }
}
```

- [ ] **Step 2: Crear TasksModule**

Crear `src/tasks/tasks.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Module({
  providers: [TasksService],
})
export class TasksModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/tasks
git commit -m "feat: TasksModule — CRUD de tareas + registro de 5 tools en ToolRegistry"
```

---

### Task 4: ClaudeService — loop agentic con tool use

**Files:**
- Modify: `src/claude/claude.service.ts`

- [ ] **Step 1: Reemplazar claude.service.ts**

Contenido completo de `src/claude/claude.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

const SYSTEM_PROMPT = `Eres Marcus Aurelius, filósofo estoico y emperador romano. \
Respondes con sabiduría práctica: directo, sin adulaciones, breve. \
Evitás el lenguaje moderno de autoayuda. Usás el idioma del interlocutor.`;

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
  ): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    const tools = this.toolRegistry.getDefinitions();

    this.logger.debug(
      `Llamando a Claude (model=${this.model}, mensajes=${messages.length}, tools=${tools.length})`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
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
        } catch (err) {
          result = { error: (err as Error).message };
        }
        this.logger.debug(`Tool ${block.name} → ${JSON.stringify(result)}`);
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
      system: SYSTEM_PROMPT,
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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/claude/claude.service.ts
git commit -m "feat: ClaudeService — loop agentic con tool use (máx 1 ronda)"
```

---

### Task 5: Wiring — AppModule + AppService

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/app.service.ts`

- [ ] **Step 1: Actualizar AppModule**

Contenido completo de `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ClaudeModule } from './claude/claude.module';
import { ConversationModule } from './conversation/conversation.module';
import { ToolRegistryModule } from './tool-registry/tool-registry.module';
import { TasksModule } from './tasks/tasks.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ToolRegistryModule,
    WhatsappModule,
    ClaudeModule,
    ConversationModule,
    TasksModule,
  ],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 2: Actualizar AppService — pasar jid a claude.chat()**

Contenido completo de `src/app.service.ts`:

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeService } from './claude/claude.service';
import { ConversationService } from './conversation/conversation.service';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly claude: ClaudeService,
  ) {}

  onModuleInit(): void {
    this.whatsapp.setHandler(async ({ jid, text }) => {
      this.logger.log(`[${jid}] ← "${text}"`);
      const history = await this.conversation.getHistory(jid);
      const reply = await this.claude.chat(history, text, jid);
      await this.conversation.saveMessage(jid, 'user', text);
      await this.conversation.saveMessage(jid, 'assistant', reply);
      this.logger.debug(
        `[${jid}] user: "${text}" → assistant: "${reply.slice(0, 60)}…"`,
      );
      return reply;
    });
  }
}
```

- [ ] **Step 3: Verificar compilación completa**

```bash
npx nest build 2>&1
```

Salida esperada: sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/app.module.ts src/app.service.ts
git commit -m "feat: wiring — AppModule importa ToolRegistryModule y TasksModule"
```

---

### Task 6: Smoke test manual

- [ ] **Step 1: Levantar el servidor**

```bash
npm run start:dev
```

Esperado en logs: las 5 tools aparecen en debug (`Tool registrada: create_task`, etc.)

- [ ] **Step 2: Probar desde WhatsApp**

Enviar los siguientes mensajes y verificar las respuestas:

| Mensaje | Comportamiento esperado |
|---------|------------------------|
| `recordame comprar leche mañana` | Claude llama `create_task`, confirma en texto |
| `qué tengo pendiente?` | Claude llama `list_tasks`, lista las tareas |
| `ya compré la leche, tachá la tarea 1` | Claude llama `complete_task(1)`, confirma |
| `cambiá el título de la tarea 2 a "comprar pan"` | Claude llama `edit_task`, confirma |
| `borrá la tarea 2` | Claude llama `delete_task`, confirma |

- [ ] **Step 3: Verificar en SQLite que los datos persisten**

```bash
npx prisma studio
```

Abrir `http://localhost:5555`, revisar tabla `Task`.
