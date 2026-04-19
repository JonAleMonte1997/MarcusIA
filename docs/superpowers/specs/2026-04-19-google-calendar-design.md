# Google Calendar Integration — Design Spec

**Fecha:** 2026-04-19
**Fase MVP:** 4

## Objetivo

Integrar Google Calendar como tool use en Marcus para que Claude pueda listar, crear, actualizar y eliminar eventos en nombre del usuario.

## Decisiones de diseño

- **Auth:** OAuth2 one-shot via script CLI. Tokens persistidos en `tokens.google.json` (gitignored). El SDK de googleapis refresca el `access_token` automáticamente con el `refresh_token`.
- **Calendario destino:** configurable via `GOOGLE_CALENDAR_ID` (env var), default `primary`.
- **Operaciones:** list, create, update, delete.
- **Patrón:** mismo que `TasksModule` — `GoogleCalendarModule` con `GoogleCalendarService` que registra tools en `onModuleInit`.

## Estructura de archivos

```
scripts/
  auth-google.ts

src/google-calendar/
  google-calendar.module.ts
  google-calendar.service.ts

tokens.google.json        ← gitignored
```

## Variables de entorno

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_CALENDAR_ID=primary
```

## Script de autenticación (`scripts/auth-google.ts`)

1. Genera URL de autorización con scope `https://www.googleapis.com/auth/calendar`.
2. Imprime la URL en consola; el usuario la abre manualmente en el browser.
3. Levanta servidor HTTP efímero en `localhost:3000` para capturar el `code` del callback.
4. Intercambia `code` por tokens y escribe `tokens.google.json`.
5. Cierra el servidor y termina.

## Tools registradas

### `list_calendar_events`

- **Parámetros:** `time_min?` (ISO8601), `time_max?` (ISO8601)
- **Default:** `time_min = now`, `time_max = now + 7 days`
- **Retorna:** array de `{ id, summary, start, end, location, description }`

### `create_calendar_event`

- **Parámetros:** `summary` (requerido), `start` (ISO8601, requerido), `end` (ISO8601, requerido), `description?`, `location?`
- **Retorna:** `{ id, summary, start, end }`

### `update_calendar_event`

- **Parámetros:** `event_id` (requerido), `summary?`, `start?`, `end?`, `description?`, `location?`
- **Retorna:** `{ ok: true, id }` o `{ error: string }`

### `delete_calendar_event`

- **Parámetros:** `event_id` (requerido)
- **Retorna:** `{ ok: true }` o `{ error: string }`

## Integración con AppModule

`GoogleCalendarModule` se importa en `AppModule` junto a `TasksModule` y `ToolRegistryModule`.

## Dependencias npm

```
googleapis
```

No se necesitan dependencias adicionales — `@anthropic-ai/sdk` y NestJS ya están.
