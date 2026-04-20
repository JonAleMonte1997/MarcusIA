# Telegram Integration Design

**Date:** 2026-04-20  
**Status:** Approved

## Goal

Add Telegram as a second messaging channel alongside the existing WhatsApp/Baileys integration. Both channels share the same conversation history and session, identified by a fixed `OWNER_ID` in the environment config.

## Architecture

```
WhatsappService ─┐
                  ├──→ AppService → Claude / Session / Memory / Conversation
TelegramService ─┘
```

Both services follow the same contract: expose a `setHandler()` method that `AppService` calls to wire up message processing. The session key is no longer the WhatsApp JID but a fixed `OWNER_ID` from `.env`, used by both channels.

## New Files

### `src/telegram/telegram.module.ts`
- Imports `TelegrafModule.forRootAsync()` configured with `TELEGRAM_BOT_TOKEN` from `ConfigService`
- Provides and exports `TelegramService`
- Declares `TelegramUpdate`

### `src/telegram/telegram.service.ts`
- Same contract as `WhatsappService`: exposes `setHandler(fn: MessageHandler)`
- Filters incoming messages to `OWNER_TELEGRAM_CHAT_ID` only — ignores all other senders
- Sends "typing..." action (`sendChatAction`) while processing
- Sends reply text via `ctx.reply()`
- Re-uses the same `InboundMessage` and `MessageHandler` types from `whatsapp.service.ts` (or moves them to a shared types file)

### `src/telegram/telegram.update.ts`
- Decorated with `@Update()` from `nestjs-telegraf`
- Handles `@On('text')` — delegates directly to `TelegramService`

## Modified Files

### `src/app.module.ts`
- Adds `TelegramModule` to imports

### `src/app.service.ts`
- Injects `TelegramService`
- Registers the same handler logic for both channels
- Both channels use `OWNER_ID` (from `ConfigService`) as the session key instead of the raw JID/chatId

### `.env` (and `.env.example`)
- Adds `TELEGRAM_BOT_TOKEN=<token from @BotFather>`
- Adds `OWNER_TELEGRAM_CHAT_ID=<numeric chat id>`
- Adds `OWNER_ID=<shared owner identifier used as session key>`

## Shared Types

Move `InboundMessage` and `MessageHandler` from `whatsapp.service.ts` to `src/messaging.types.ts` so both services import from the same place.

## Pre-requisites (manual steps before coding)

1. Open Telegram → search `@BotFather` → send `/newbot` → follow prompts → copy token
2. Send any message to the new bot
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in browser → find `chat.id` → copy it

## Dependencies

```bash
npm install nestjs-telegraf telegraf
```

## Error Handling

- If the message sender is not `OWNER_TELEGRAM_CHAT_ID`, silently ignore
- On handler error, reply with the same error message pattern used in `WhatsappService`
- Lifecycle follows NestJS module init/shutdown — no custom reconnect logic needed (Telegraf handles it)

## Out of Scope

- Multi-user support
- Media/file messages (only text)
- Telegram-specific commands (`/start`, etc.) beyond basic text handling
