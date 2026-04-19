# Fase 2: Claude + Memoria Conversacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Claude Sonnet con memoria conversacional persistente por JID en SQLite al pipeline de WhatsApp de Marcus.

**Architecture:** `AppService` (OnModuleInit) orquesta `ConversationService` → `ClaudeService` → `ConversationService` y registra el handler en `WhatsappService`. `PrismaModule` (global) expone SQLite. Cada módulo tiene una responsabilidad única.

**Tech Stack:** NestJS, `@anthropic-ai/sdk` (claude-sonnet-4-6), Prisma + SQLite (`@prisma/client`), `@whiskeysockets/baileys` (ya instalado).

---

## Mapa de archivos

| Acción | Archivo |
|--------|---------|
| Crear | `prisma/schema.prisma` |
| Crear | `src/prisma/prisma.service.ts` |
| Crear | `src/prisma/prisma.module.ts` |
| Crear | `src/conversation/conversation.service.ts` |
| Crear | `src/conversation/conversation.module.ts` |
| Crear | `src/claude/claude.service.ts` |
| Crear | `src/claude/claude.module.ts` |
| Crear | `src/app.service.ts` |
| Modificar | `src/app.module.ts` |
| Modificar | `.env.example` |

---

## Task 1: Instalar dependencias

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Instalar dependencias de runtime**

```bash
cd /Users/jonathanalexismontenegro/repos/MarcusIA
npm install @anthropic-ai/sdk @prisma/client
```

- [ ] **Step 2: Instalar prisma como devDependency**

```bash
npm install --save-dev prisma
```

- [ ] **Step 3: Verificar instalación**

```bash
npx prisma --version
node -e "require('@anthropic-ai/sdk'); console.log('ok')"
```

Esperado: versión de Prisma impresa + `ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk and prisma dependencies"
```

---

## Task 2: Prisma schema y migración

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Crear `prisma/schema.prisma`**

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
```

- [ ] **Step 2: Generar cliente Prisma**

```bash
npx prisma generate
```

Esperado: `✔ Generated Prisma Client`.

- [ ] **Step 3: Crear la migración inicial**

Asegurarse de que `.env` tiene `DATABASE_URL="file:./marcus.db"`, luego:

```bash
npx prisma migrate dev --name init
```

Esperado: `✔ Your database is now in sync with your schema.` y archivo `prisma/migrations/*/migration.sql` creado.

- [ ] **Step 4: Verificar que la DB existe**

```bash
ls -la marcus.db
```

Esperado: archivo `marcus.db` en la raíz del proyecto.

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/generated/ 2>/dev/null; git add prisma/
git commit -m "feat: prisma schema Message model + SQLite migration"
```

---

## Task 3: PrismaModule

**Files:**
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`

- [ ] **Step 1: Crear `src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
```

- [ ] **Step 2: Crear `src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/prisma/
git commit -m "feat: PrismaModule global con PrismaService"
```

---

## Task 4: ConversationModule

**Files:**
- Create: `src/conversation/conversation.service.ts`
- Create: `src/conversation/conversation.module.ts`

- [ ] **Step 1: Crear `src/conversation/conversation.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HISTORY_LIMIT = 20;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async saveMessage(
    jid: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({ data: { jid, role, content } });
  }

  async getHistory(
    jid: string,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<MessageParam[]> {
    const rows = await this.prisma.message.findMany({
      where: { jid },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }
}
```

- [ ] **Step 2: Crear `src/conversation/conversation.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Module({
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/conversation/
git commit -m "feat: ConversationModule — persiste y recupera historial por JID"
```

---

## Task 5: ClaudeModule

**Files:**
- Create: `src/claude/claude.service.ts`
- Create: `src/claude/claude.module.ts`

- [ ] **Step 1: Crear `src/claude/claude.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const SYSTEM_PROMPT = `Eres Marcus Aurelius, filósofo estoico y emperador romano. \
Respondes con sabiduría práctica: directo, sin adulaciones, breve. \
Evitás el lenguaje moderno de autoayuda. Usás el idioma del interlocutor.`;

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6');
    this.maxTokens = this.config.get<number>('CLAUDE_MAX_TOKENS', 1024);
  }

  async chat(history: MessageParam[], userText: string): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    this.logger.debug(
      `Llamando a Claude (model=${this.model}, mensajes=${messages.length})`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages,
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error(`Bloque inesperado de Claude: ${block.type}`);
    }
    return block.text;
  }
}
```

- [ ] **Step 2: Crear `src/claude/claude.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';

@Module({
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/claude/
git commit -m "feat: ClaudeModule — llama a Claude Sonnet con system prompt Marco Aurelio"
```

---

## Task 6: AppService + actualizar AppModule

**Files:**
- Create: `src/app.service.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Crear `src/app.service.ts`**

```typescript
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
      await this.conversation.saveMessage(jid, 'user', text);
      const history = await this.conversation.getHistory(jid);
      const reply = await this.claude.chat(history, text);
      await this.conversation.saveMessage(jid, 'assistant', reply);
      this.logger.debug(`[${jid}] user: "${text}" → assistant: "${reply.slice(0, 60)}…"`);
      return reply;
    });
  }
}
```

- [ ] **Step 2: Actualizar `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ClaudeModule } from './claude/claude.module';
import { ConversationModule } from './conversation/conversation.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WhatsappModule,
    ClaudeModule,
    ConversationModule,
  ],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app.service.ts src/app.module.ts
git commit -m "feat: AppService orquesta Claude + Conversation + WhatsApp handler"
```

---

## Task 7: Actualizar .env.example y smoke test

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Actualizar `.env.example`** con las variables nuevas si no están ya:

```bash
cat .env.example
```

Verificar que estén estas tres líneas (ya deberían estar del bootstrap):

```
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6
DATABASE_URL="file:./marcus.db"
```

Si falta alguna, agregarla. Luego verificar que `.env` (local, no commiteado) tiene `ANTHROPIC_API_KEY` con un valor real.

- [ ] **Step 2: Agregar `CLAUDE_MAX_TOKENS` al .env.example**

Editar `.env.example` y agregar al final:

```
# Límite de tokens por respuesta de Claude (default 1024).
CLAUDE_MAX_TOKENS=1024
```

- [ ] **Step 3: Levantar la app**

```bash
npm run start:dev
```

Esperado: logs de conexión WhatsApp, QR si no hay sesión activa, o `WhatsApp conectado` si ya estaba autenticado.

- [ ] **Step 4: Smoke test manual**

Desde el teléfono en el chat de self-chat (o desde WhatsApp Web), enviar:

```
Qué es la virtud?
```

Esperado: respuesta de Marcus en tono estoico, en el idioma del mensaje.

- [ ] **Step 5: Verificar que el historial persiste**

```bash
npx prisma studio
```

Abrir `http://localhost:5555` y verificar que la tabla `Message` tiene filas con `role=user` y `role=assistant` para tu JID.

- [ ] **Step 6: Commit final**

```bash
git add .env.example
git commit -m "chore: update .env.example con CLAUDE_MAX_TOKENS"
```

---

## Checklist de cobertura del spec

- [x] `PrismaModule` global con SQLite + tabla `Message` con índice `[jid, createdAt]`
- [x] `ClaudeService.chat(history, userText)` → `string`
- [x] `ConversationService.getHistory(jid, limit=20)` → `MessageParam[]` ordenado ASC
- [x] `ConversationService.saveMessage(jid, role, content)`
- [x] `AppService` orquesta el flujo completo y registra handler en `WhatsappService`
- [x] System prompt: Marcus Aurelius, estoico, idioma del interlocutor
- [x] Variables de entorno: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `DATABASE_URL`, `CLAUDE_MAX_TOKENS`
- [x] Historial por JID (no global)
