# Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Google Calendar como tool use en Marcus: 4 tools (list/create/update/delete) registradas en ToolRegistry, autenticación OAuth2 one-shot via script CLI.

**Architecture:** `GoogleCalendarModule` sigue el mismo patrón que `TasksModule` — un `GoogleCalendarService` que en `onModuleInit` inicializa el cliente OAuth2 (leyendo `tokens.google.json`) y registra las 4 tools en el `ToolRegistryService` global. Si el archivo de tokens no existe, el módulo se inicializa en modo degradado (logea un warning, no tira error).

**Tech Stack:** NestJS, TypeScript estricto, googleapis npm, google-auth-library (incluida en googleapis), dotenv (dev dep para el script CLI).

---

## Archivos creados/modificados

| Archivo | Acción |
|---------|--------|
| `scripts/auth-google.ts` | Crear — script OAuth2 one-shot |
| `tsconfig.scripts.json` | Crear — override para ts-node (module: commonjs) |
| `src/google-calendar/google-calendar.module.ts` | Crear |
| `src/google-calendar/google-calendar.service.ts` | Crear |
| `src/app.module.ts` | Modificar — importar GoogleCalendarModule |
| `.env` | Modificar — agregar vars de Google |
| `.gitignore` | Modificar — ignorar tokens.google.json |

---

## Task 1: Instalar dependencias + configurar entorno

**Files:**
- Modify: `.gitignore`
- Modify: `.env`

- [ ] **Step 1: Instalar googleapis y dotenv**

```bash
pnpm add googleapis
pnpm add -D dotenv
```

Verificar que aparecen en `package.json`:
- `"googleapis"` en `dependencies`
- `"dotenv"` en `devDependencies`

- [ ] **Step 2: Agregar tokens.google.json al .gitignore**

Agregar al final de `.gitignore`:

```
# Google OAuth tokens
tokens.google.json
```

- [ ] **Step 3: Agregar variables de entorno a .env**

Agregar al final de `.env`:

```
# Google Calendar OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_CALENDAR_ID=primary
```

(Los valores se completan después de crear las credenciales en Google Cloud Console.)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore .env
git commit -m "chore: add googleapis dep + Google env vars"
```

---

## Task 2: Script de autenticación OAuth2

**Files:**
- Create: `scripts/auth-google.ts`
- Create: `tsconfig.scripts.json`

- [ ] **Step 1: Crear tsconfig.scripts.json**

El tsconfig principal usa `module: nodenext` (para NestJS), pero ts-node necesita commonjs para scripts simples.

Crear `/tsconfig.scripts.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node"
  }
}
```

- [ ] **Step 2: Crear el script de autenticación**

Crear `scripts/auth-google.ts`:

```typescript
import * as dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback';
const TOKENS_PATH = path.join(process.cwd(), 'tokens.google.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar en .env');
  process.exit(1);
}

async function main(): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });

  console.log('\nAbrí esta URL en el browser:\n');
  console.log(authUrl);
  console.log('\nEsperando callback en http://localhost:3000...\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Error: no se recibió código de autorización.');
        server.close();
        reject(new Error('No code in OAuth callback'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Autenticación exitosa. Podés cerrar esta pestaña.</h2>');
      server.close();
      resolve(code);
    });
    server.listen(3000);
    server.on('error', reject);
  });

  const { tokens } = await oauth2Client.getToken(code);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nTokens guardados en ${TOKENS_PATH}`);
  console.log('Ya podés iniciar Marcus normalmente.');
}

main().catch((err) => {
  console.error('Error durante la autenticación:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verificar que el script compila sin errores**

```bash
npx ts-node --project tsconfig.scripts.json --transpile-only scripts/auth-google.ts 2>&1 | head -5
```

Esperado: el script arranca y muestra el mensaje de error por falta de credenciales en .env (todavía están vacías), o si ya están completas abre el servidor. En cualquier caso, no debe haber errores de TypeScript.

Si hay error de módulo no encontrado, verificar que `googleapis` y `dotenv` estén instalados:
```bash
pnpm list googleapis dotenv
```

- [ ] **Step 4: Commit**

```bash
git add scripts/auth-google.ts tsconfig.scripts.json
git commit -m "feat: OAuth2 one-shot auth script para Google Calendar"
```

---

## Task 3: GoogleCalendarModule + GoogleCalendarService (skeleton + OAuth2 init)

**Files:**
- Create: `src/google-calendar/google-calendar.module.ts`
- Create: `src/google-calendar/google-calendar.service.ts`

En este task se crea el servicio con la lógica de inicialización OAuth2. Las tools se registran en el task siguiente para commits más atómicos.

- [ ] **Step 1: Crear el módulo**

Crear `src/google-calendar/google-calendar.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  providers: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
```

- [ ] **Step 2: Crear el servicio con OAuth2 init**

Crear `src/google-calendar/google-calendar.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

const TOKENS_PATH = path.join(process.cwd(), 'tokens.google.json');

@Injectable()
export class GoogleCalendarService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private calendar: calendar_v3.Calendar | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
  ) {}

  onModuleInit(): void {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI', 'http://localhost:3000/oauth2callback');

    if (!clientId || !clientSecret) {
      this.logger.warn('GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configurados — Google Calendar deshabilitado.');
      return;
    }

    if (!fs.existsSync(TOKENS_PATH)) {
      this.logger.warn(
        `${TOKENS_PATH} no encontrado — Google Calendar deshabilitado. Ejecutá: npx ts-node --project tsconfig.scripts.json scripts/auth-google.ts`,
      );
      return;
    }

    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8')) as Record<string, unknown>;
    const auth = new OAuth2Client({ clientId, clientSecret, redirectUri });
    auth.setCredentials(tokens);

    auth.on('tokens', (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
      this.logger.debug('Tokens de Google actualizados en disco.');
    });

    this.calendar = google.calendar({ version: 'v3', auth });
    this.registerTools();
    this.logger.log('Google Calendar inicializado correctamente.');
  }

  private calendarId(): string {
    return this.config.get<string>('GOOGLE_CALENDAR_ID', 'primary');
  }

  private registerTools(): void {
    // tools se registran en los tasks siguientes
  }
}
```

- [ ] **Step 3: Verificar compilación TypeScript**

```bash
pnpm build 2>&1 | tail -10
```

Esperado: build exitoso sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/google-calendar/
git commit -m "feat: GoogleCalendarModule + skeleton con OAuth2 init"
```

---

## Task 4: Tool list_calendar_events

**Files:**
- Modify: `src/google-calendar/google-calendar.service.ts`

- [ ] **Step 1: Agregar método listEvents + registrar tool**

Reemplazar el método `registerTools()` y agregar `listEvents` en `google-calendar.service.ts`.

Reemplazar:
```typescript
  private registerTools(): void {
    // tools se registran en los tasks siguientes
  }
```

Por:
```typescript
  private registerTools(): void {
    this.registry.register({
      definition: {
        name: 'list_calendar_events',
        description:
          'Lista los próximos eventos del calendario de Google del usuario.',
        input_schema: {
          type: 'object',
          properties: {
            time_min: {
              type: 'string',
              description: 'Inicio del rango en ISO8601 (default: ahora)',
            },
            time_max: {
              type: 'string',
              description: 'Fin del rango en ISO8601 (default: ahora + 7 días)',
            },
          },
        },
      },
      handler: (input) => this.listEvents(input),
    });
  }

  async listEvents(input: Record<string, unknown>): Promise<unknown> {
    if (!this.calendar) return { error: 'Google Calendar no está inicializado.' };
    const now = new Date();
    const timeMin =
      (input.time_min as string | undefined) ?? now.toISOString();
    const timeMax =
      (input.time_max as string | undefined) ??
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res = await this.calendar.events.list({
      calendarId: this.calendarId(),
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary ?? '(sin título)',
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      location: e.location ?? null,
      description: e.description ?? null,
    }));
  }
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm build 2>&1 | tail -10
```

Esperado: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add src/google-calendar/google-calendar.service.ts
git commit -m "feat: tool list_calendar_events"
```

---

## Task 5: Tool create_calendar_event

**Files:**
- Modify: `src/google-calendar/google-calendar.service.ts`

- [ ] **Step 1: Agregar create_calendar_event al final de registerTools() y agregar createEvent**

Dentro de `registerTools()`, agregar después del `register` de `list_calendar_events`:

```typescript
    this.registry.register({
      definition: {
        name: 'create_calendar_event',
        description: 'Crea un evento en el calendario de Google del usuario.',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Título del evento' },
            start: {
              type: 'string',
              description: 'Inicio del evento en ISO8601 con timezone (ej: 2026-04-20T10:00:00-03:00)',
            },
            end: {
              type: 'string',
              description: 'Fin del evento en ISO8601 con timezone',
            },
            description: {
              type: 'string',
              description: 'Descripción del evento (opcional)',
            },
            location: {
              type: 'string',
              description: 'Ubicación del evento (opcional)',
            },
          },
          required: ['summary', 'start', 'end'],
        },
      },
      handler: (input) => this.createEvent(input),
    });
```

Agregar el método `createEvent` después de `listEvents`:

```typescript
  async createEvent(input: Record<string, unknown>): Promise<unknown> {
    if (!this.calendar) return { error: 'Google Calendar no está inicializado.' };
    const res = await this.calendar.events.insert({
      calendarId: this.calendarId(),
      requestBody: {
        summary: input.summary as string,
        start: { dateTime: input.start as string },
        end: { dateTime: input.end as string },
        ...(input.description
          ? { description: input.description as string }
          : {}),
        ...(input.location ? { location: input.location as string } : {}),
      },
    });

    return {
      id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime ?? res.data.start?.date ?? null,
      end: res.data.end?.dateTime ?? res.data.end?.date ?? null,
    };
  }
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm build 2>&1 | tail -10
```

Esperado: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add src/google-calendar/google-calendar.service.ts
git commit -m "feat: tool create_calendar_event"
```

---

## Task 6: Tools update_calendar_event y delete_calendar_event

**Files:**
- Modify: `src/google-calendar/google-calendar.service.ts`

- [ ] **Step 1: Agregar update_calendar_event al final de registerTools()**

```typescript
    this.registry.register({
      definition: {
        name: 'update_calendar_event',
        description: 'Actualiza un evento existente en el calendario de Google.',
        input_schema: {
          type: 'object',
          properties: {
            event_id: {
              type: 'string',
              description: 'ID del evento a actualizar (obtenido de list_calendar_events)',
            },
            summary: { type: 'string', description: 'Nuevo título (opcional)' },
            start: {
              type: 'string',
              description: 'Nuevo inicio en ISO8601 con timezone (opcional)',
            },
            end: {
              type: 'string',
              description: 'Nuevo fin en ISO8601 con timezone (opcional)',
            },
            description: {
              type: 'string',
              description: 'Nueva descripción (opcional)',
            },
            location: {
              type: 'string',
              description: 'Nueva ubicación (opcional)',
            },
          },
          required: ['event_id'],
        },
      },
      handler: (input) => this.updateEvent(input),
    });

    this.registry.register({
      definition: {
        name: 'delete_calendar_event',
        description: 'Elimina un evento del calendario de Google.',
        input_schema: {
          type: 'object',
          properties: {
            event_id: {
              type: 'string',
              description: 'ID del evento a eliminar (obtenido de list_calendar_events)',
            },
          },
          required: ['event_id'],
        },
      },
      handler: (input) => this.deleteEvent(input),
    });
```

- [ ] **Step 2: Agregar métodos updateEvent y deleteEvent**

Agregar después de `createEvent`:

```typescript
  async updateEvent(input: Record<string, unknown>): Promise<unknown> {
    if (!this.calendar) return { error: 'Google Calendar no está inicializado.' };
    const eventId = input.event_id as string;
    try {
      const patch: calendar_v3.Schema$Event = {};
      if (input.summary) patch.summary = input.summary as string;
      if (input.start) patch.start = { dateTime: input.start as string };
      if (input.end) patch.end = { dateTime: input.end as string };
      if (input.description !== undefined)
        patch.description = input.description as string;
      if (input.location !== undefined)
        patch.location = input.location as string;

      await this.calendar.events.patch({
        calendarId: this.calendarId(),
        eventId,
        requestBody: patch,
      });
      return { ok: true, id: eventId };
    } catch {
      return { error: `Evento ${eventId} no encontrado o no se pudo actualizar.` };
    }
  }

  async deleteEvent(input: Record<string, unknown>): Promise<unknown> {
    if (!this.calendar) return { error: 'Google Calendar no está inicializado.' };
    const eventId = input.event_id as string;
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId(),
        eventId,
      });
      return { ok: true };
    } catch {
      return { error: `No se pudo eliminar el evento ${eventId}.` };
    }
  }
```

- [ ] **Step 3: Verificar compilación**

```bash
pnpm build 2>&1 | tail -10
```

Esperado: build exitoso sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/google-calendar/google-calendar.service.ts
git commit -m "feat: tools update_calendar_event y delete_calendar_event"
```

---

## Task 7: Conectar AppModule + verificación manual

**Files:**
- Modify: `src/app.module.ts`

- [ ] **Step 1: Importar GoogleCalendarModule en AppModule**

En `src/app.module.ts`, agregar el import:

```typescript
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
```

Y agregarlo al array `imports`:

```typescript
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ToolRegistryModule,
    WhatsappModule,
    ClaudeModule,
    ConversationModule,
    TasksModule,
    GoogleCalendarModule,   // ← agregar
  ],
```

- [ ] **Step 2: Verificar compilación final**

```bash
pnpm build 2>&1 | tail -10
```

Esperado: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add src/app.module.ts
git commit -m "feat: wiring — AppModule importa GoogleCalendarModule"
```

- [ ] **Step 4: Autenticar con Google (prerequisito para la prueba e2e)**

Antes de probar en vivo, completar las credenciales en `.env`:
1. Ir a Google Cloud Console → APIs & Services → Credentials
2. Crear un OAuth 2.0 Client ID (tipo "Web application")
3. Agregar `http://localhost:3000/oauth2callback` como Redirect URI autorizado
4. Copiar Client ID y Client Secret al `.env`
5. Habilitar la Google Calendar API en el proyecto de GCP
6. Ejecutar el script de auth:

```bash
npx ts-node --project tsconfig.scripts.json scripts/auth-google.ts
```

Seguir las instrucciones en consola. Al finalizar, `tokens.google.json` debe existir en la raíz del proyecto.

- [ ] **Step 5: Prueba e2e via WhatsApp**

Iniciar Marcus:
```bash
pnpm start:dev
```

Verificar en los logs de arranque:
```
[GoogleCalendarService] Google Calendar inicializado correctamente.
```

Enviarle a Marcus por WhatsApp:
- "¿Qué tengo en el calendario esta semana?" → debe llamar `list_calendar_events` y responder con tus eventos
- "Agendame una reunión mañana a las 10 por una hora llamada 'Prueba Marcus'" → debe llamar `create_calendar_event`
- "Mostrá mis eventos y eliminá el de 'Prueba Marcus'" → debe llamar `list_calendar_events` luego `delete_calendar_event`
