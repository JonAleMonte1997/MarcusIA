# Plan: Bootstrap NestJS + Baileys eco

**Spec:** [spec.md](./spec.md)
**Status:** approved

## Resumen técnico

Proyecto NestJS generado con `nest new`. Sin HTTP server (usamos `NestFactory.createApplicationContext`, Baileys no necesita puerto). Un único módulo `WhatsappModule` con un servicio `WhatsappService` que mantiene el socket Baileys, escucha `messages.upsert` y responde con un handler inyectable. Para Fase 1 el handler default es un eco; en specs futuros se reemplaza por Agent sin tocar Baileys.

## Decisiones de arquitectura

| # | Decisión | Alternativa descartada | Por qué |
|---|----------|-----------------------|---------|
| 1 | `NestFactory.createApplicationContext` en vez de `create()` | Levantar HTTP server | No hay webhooks ni endpoints todavía. Menos superficie, menos puertos que manejar. |
| 2 | Handler como función inyectable (`setHandler`) | Acoplar `WhatsappService` al Agent directamente | Permite reemplazar el handler en specs futuros sin tocar Baileys. También habilita testear Whatsapp aislado. |
| 3 | Sesión en `./auth_info_baileys/` vía `useMultiFileAuthState` | SQL/Redis | Filesystem es lo que Baileys trae por default, zero infra, suficiente para single-user. |
| 4 | Owner JID hardcodeado en `.env` | Aceptar cualquier remitente | Single-user by design. Evita que un mensaje accidental a un número equivocado dispare lógica. |
| 5 | Reconexión con `setTimeout(3000)` fijo | Backoff exponencial | KISS para Fase 1. El hardening vive en spec 005. |
| 6 | `printQRInTerminal: false` + render manual con `qrcode-terminal` | Usar el flag de Baileys | El flag está deprecated en versiones recientes y genera warnings. |
| 7 | Logger de Baileys en `warn` | Default (trace) | Logs default son ruidosos y opacan nuestros propios logs. |
| 8 | `fetchLatestBaileysVersion()` + `browser: ['Marcus', 'Desktop', '1.0.0']` pasados a `makeWASocket` | Dejar la versión/browser default del paquete | Con la versión hardcodeada en el paquete, WA respondió `status=405` al handshake y el QR nunca se emitió. Pedir la versión vigente al endpoint de WA + identificar el browser explícitamente soluciona el rechazo. |
| 9 | Self-chat mode: filtro acepta solo `fromMe=true` + `remoteJid === OWNER_WHATSAPP_JID`, con dedup por `key.id` de mensajes enviados por Marcus | Mantener el filtro original (`fromMe=false`) y pedir un segundo número para testear | Jonathan todavía no tiene un número dedicado para Marcus. Correr Marcus en su propio número permite testear el canal en el chat "conmigo mismo". Dedup necesario porque las respuestas de Marcus también llegan con `fromMe=true` al mismo JID. Cuando haya número dedicado, se vuelve a `fromMe=false` + `OWNER_JID` = JID de Jonathan. |
| 10 | `acceptedJids` se construye al conectar con `jidNormalizedUser(sock.user.id/lid/phoneNumber)` + el del `.env`; `OWNER_WHATSAPP_JID` pasa a ser opcional | Exigir `OWNER_WHATSAPP_JID` y comparar contra un único JID | WA ahora emite identificadores `@lid` (privacidad) además del clásico `@s.whatsapp.net`. `sock.user` expone ambos. El `remoteJid` de un mensaje puede venir en cualquiera de los dos formatos, así que hay que aceptar todos los que pertenezcan al dueño y normalizar antes de comparar. |

## Módulos afectados

- `src/app.module.ts` — imports `ConfigModule.forRoot({ isGlobal: true })` y `WhatsappModule`.
- `src/main.ts` — bootstrap sin puerto.
- `src/whatsapp/whatsapp.module.ts` — declara y exporta `WhatsappService`.
- `src/whatsapp/whatsapp.service.ts` — conexión, handlers de eventos, envío. Handler default = eco.

## Cambios en data model

Ninguno. No hay DB en este spec.

## Dependencias nuevas

- `@nestjs/config` — lectura de `.env`.
- `@whiskeysockets/baileys` — cliente WhatsApp.
- `@hapi/boom` — tipado de errores que Baileys reexporta en `DisconnectReason`.
- `qrcode-terminal` — render del QR en ASCII.
- `pino` — logger pasado a Baileys.
- Dev: `@types/qrcode-terminal`.

## Variables de entorno nuevas

- `OWNER_WHATSAPP_JID` — JID del único remitente aceptado. Formato: `<numero_sin_plus>@s.whatsapp.net`.

(También reservamos `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `DATABASE_URL` en `.env.example` para evitar re-editarlo en specs siguientes, aunque este spec no los use.)

## Riesgos y mitigaciones

- **Baileys rompe entre versiones.** Mitigación: fijar versión en `package.json` (sin `^`) y verificar tipos contra docs antes de codear cada campo.
- **QR expira si no lo escaneo rápido.** Baileys vuelve a emitir nuevo QR en el mismo evento; no requiere manejo especial.
- **`loggedOut` desde el teléfono.** Si pasa, reconectar en loop no sirve — hay que re-escanear. El código distingue `DisconnectReason.loggedOut` y no reintenta en ese caso.

## Plan de rollback

Borrar `auth_info_baileys/` y `node_modules/`. Volver a una versión previa del repo con `git reset`. Riesgo nulo: no hay DB, no hay estado externo que limpiar.

## Verificación antes de declarar done

- **QR + pairing** → revisar output de `pnpm start:dev` al primer arranque, escanear, confirmar log `WhatsApp conectado`.
- **Eco funciona** → enviar `hola`, recibir `pong · hola`.
- **Persistencia de sesión** → `Ctrl+C`, `pnpm start:dev`, confirmar que no pide QR.
- **Ignora no-owner** → mandar mensaje desde un número no configurado, confirmar que no hay respuesta ni error en logs.
- **Reconexión** → cortar Wi-Fi 10s, restablecer, confirmar `Conexión cerrada` seguido de `WhatsApp conectado` sin intervención.
