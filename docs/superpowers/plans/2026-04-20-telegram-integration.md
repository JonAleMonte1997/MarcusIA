# Telegram Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram as a second messaging channel that shares conversation history and session with WhatsApp, both keyed by a fixed `OWNER_ID`.

**Architecture:** `TelegramService` follows the same `setHandler()` contract as `WhatsappService`. `AppService` is updated to use a fixed `OWNER_ID` from config as the session/memory key for both channels. Both channels are independent NestJS modules wired into `AppModule`.

**Tech Stack:** NestJS, `nestjs-telegraf`, `telegraf`, Prisma, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/messaging.types.ts` | Shared `InboundMessage` and `MessageHandler` types |
| Create | `src/telegram/telegram.module.ts` | NestJS module wiring `TelegrafModule` |
| Create | `src/telegram/telegram.service.ts` | Owns `setHandler()`, filters by `OWNER_TELEGRAM_CHAT_ID`, sends typing |
| Create | `src/telegram/telegram.update.ts` | Telegraf `@Update` class, routes `@On('text')` to `TelegramService` |
| Modify | `src/whatsapp/whatsapp.service.ts` | Import types from `src/messaging.types.ts` instead of local |
| Modify | `src/app.service.ts` | Use `OWNER_ID` from config; inject and wire `TelegramService` |
| Modify | `src/app.module.ts` | Import `TelegramModule` |
| Modify | `.env` | Add `TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_CHAT_ID`, `OWNER_ID` |
| Modify | `.env.example` | Same additions as `.env` |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install Telegram packages**

```bash
pnpm add nestjs-telegraf telegraf
```

Expected output: packages added without errors.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add nestjs-telegraf and telegraf dependencies"
```

---

## Task 2: Extract shared messaging types

**Files:**
- Create: `src/messaging.types.ts`
- Modify: `src/whatsapp/whatsapp.service.ts`

- [ ] **Step 1: Create `src/messaging.types.ts`**

```typescript
export type InboundMessage = { text: string; jid: string };
export type MessageHandler = (
  msg: InboundMessage,
) => Promise<string | null> | string | null;
```

- [ ] **Step 2: Update `src/whatsapp/whatsapp.service.ts` — remove local type declarations and import from shared file**

Remove lines 20-23 (the `InboundMessage` and `MessageHandler` type declarations):
```typescript
// DELETE these two lines:
export type InboundMessage = { text: string; jid: string };
export type MessageHandler = (
  msg: InboundMessage,
) => Promise<string | null> | string | null;
```

Add import at the top of the file (after the existing imports):
```typescript
import type { InboundMessage, MessageHandler } from '../messaging.types';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm run build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/messaging.types.ts src/whatsapp/whatsapp.service.ts
git commit -m "refactor: move InboundMessage and MessageHandler to shared messaging.types"
```

---

## Task 3: Create TelegramService and TelegramUpdate

**Files:**
- Create: `src/telegram/telegram.service.ts`
- Create: `src/telegram/telegram.update.ts`

- [ ] **Step 1: Create `src/telegram/telegram.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { InboundMessage, MessageHandler } from '../messaging.types';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly ownerChatId: number;
  private handler: MessageHandler = ({ text }) => `pong · ${text}`;

  constructor(
    private readonly config: ConfigService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.ownerChatId = this.config.get<number>('OWNER_TELEGRAM_CHAT_ID', 0);
  }

  setHandler(fn: MessageHandler): void {
    this.handler = fn;
  }

  async handleText(chatId: number, text: string): Promise<void> {
    if (chatId !== this.ownerChatId) {
      this.logger.debug(`Ignorado mensaje de chatId no autorizado: ${chatId}`);
      return;
    }

    try {
      await this.bot.telegram.sendChatAction(chatId, 'typing');
      const reply = await this.handler({ text, jid: String(chatId) });
      if (reply) {
        await this.bot.telegram.sendMessage(chatId, reply);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Handler falló para "${text}": ${error.message}`, error.stack);
      await this.bot.telegram
        .sendMessage(chatId, '⚠️ Marcus tuvo un error procesando tu mensaje.')
        .catch(() => undefined);
    }
  }
}
```

- [ ] **Step 2: Create `src/telegram/telegram.update.ts`**

```typescript
import { Update, On, Context } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}

  @On('text')
  async onText(@Context() ctx: any): Promise<void> {
    const chatId: number = ctx.chat.id;
    const text: string = ctx.message.text;
    await this.telegramService.handleText(chatId, text);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm run build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/telegram/telegram.service.ts src/telegram/telegram.update.ts
git commit -m "feat: add TelegramService and TelegramUpdate"
```

---

## Task 4: Create TelegramModule

**Files:**
- Create: `src/telegram/telegram.module.ts`

- [ ] **Step 1: Create `src/telegram/telegram.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TelegramService, TelegramUpdate],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm run build
```

Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add src/telegram/telegram.module.ts
git commit -m "feat: add TelegramModule"
```

---

## Task 5: Wire TelegramModule into AppModule and AppService

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/app.service.ts`

- [ ] **Step 1: Update `src/app.module.ts`**

Add import at the top:
```typescript
import { TelegramModule } from './telegram/telegram.module';
```

Add `TelegramModule` to the `imports` array (after `WhatsappModule`):
```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  PrismaModule,
  ToolRegistryModule,
  WhatsappModule,
  TelegramModule,   // <-- add this line
  ClaudeModule,
  ConversationModule,
  TasksModule,
  GoogleCalendarModule,
  SessionModule,
  MemoryModule,
],
```

- [ ] **Step 2: Update `src/app.service.ts`**

Replace the entire file content with:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeService } from './claude/claude.service';
import { ConversationService } from './conversation/conversation.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { TelegramService } from './telegram/telegram.service';
import { SessionService } from './session/session.service';
import { MemoryService } from './memory/memory.service';
import type { InboundMessage } from './messaging.types';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  private readonly ownerId: string;

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly telegram: TelegramService,
    private readonly conversation: ConversationService,
    private readonly claude: ClaudeService,
    private readonly session: SessionService,
    private readonly memory: MemoryService,
    private readonly config: ConfigService,
  ) {
    this.ownerId = this.config.getOrThrow<string>('OWNER_ID');
  }

  onModuleInit(): void {
    const handler = async ({ text }: InboundMessage): Promise<string> => {
      try {
        const activeSession = await this.session.getOrCreate(this.ownerId);
        const sessionId = activeSession.id;

        this.logger.log(
          `← "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" (session=${sessionId})`,
        );

        const [history, memories] = await Promise.all([
          this.conversation.getSession(sessionId),
          this.memory.getAll(this.ownerId),
        ]);

        const reply = await this.claude.chat(history, text, this.ownerId, memories);

        await this.session.touch(sessionId);
        await Promise.all([
          this.conversation.saveMessage(sessionId, this.ownerId, 'user', text),
          this.conversation.saveMessage(sessionId, this.ownerId, 'assistant', reply),
        ]);

        return reply;
      } catch (err) {
        const error = err as Error;
        this.logger.error(`Error procesando mensaje: ${error.message}`, error.stack);

        if (error.message.includes('rate limit') || error.message.includes('529')) {
          return 'Marcus está saturado en este momento. Intentá en un minuto.';
        }
        return 'Marcus tuvo un problema procesando tu mensaje. Si persiste, revisá los logs.';
      }
    };

    this.whatsapp.setHandler(handler);
    this.telegram.setHandler(handler);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm run build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app.module.ts src/app.service.ts
git commit -m "feat: wire TelegramModule into AppModule and AppService with shared OWNER_ID"
```

---

## Task 6: Update environment configuration

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Add variables to `.env`**

Append to `.env`:
```
# ID único del owner usado como clave de sesión para todos los canales
OWNER_ID=marcus_owner

# Telegram
TELEGRAM_BOT_TOKEN=<token de @BotFather>
OWNER_TELEGRAM_CHAT_ID=<tu chat id numérico>
```

- [ ] **Step 2: Add variables to `.env.example`**

Append to `.env.example`:
```
# ID único del owner usado como clave de sesión para todos los canales
OWNER_ID=marcus_owner

# Telegram
TELEGRAM_BOT_TOKEN=
OWNER_TELEGRAM_CHAT_ID=
```

- [ ] **Step 3: Commit `.env.example` only (nunca commitear `.env`)**

```bash
git add .env.example
git commit -m "chore: add OWNER_ID and Telegram env vars to .env.example"
```

---

## Task 7: Smoke test end-to-end

- [ ] **Step 1: Asegurarse de tener el token y chat ID en `.env`**

Si todavía no creaste el bot en Telegram:
1. Abrí Telegram → buscá `@BotFather` → mandá `/newbot` → seguí los pasos → copiá el token
2. Mandá cualquier mensaje al bot recién creado
3. Abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` en el browser → anotá el `chat.id`
4. Pegá ambos valores en `.env`

- [ ] **Step 2: Arrancar el servidor**

```bash
pnpm run start:dev
```

Expected: logs muestran `WhatsApp conectado` (o QR para escanear) y Telegraf arranca sin errores.

- [ ] **Step 3: Verificar Telegram**

Mandá un mensaje de texto al bot desde tu cuenta de Telegram.

Expected: Marcus responde en Telegram.

- [ ] **Step 4: Verificar historial compartido**

Mandá un mensaje desde WhatsApp (ej: "mi color favorito es el azul"), luego desde Telegram preguntá "¿cuál es mi color favorito?".

Expected: Marcus recuerda la información de la sesión compartida.
