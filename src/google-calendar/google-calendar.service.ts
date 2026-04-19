import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
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
    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    auth.setCredentials(tokens);

    auth.on('tokens', (newTokens: unknown) => {
      const merged = { ...tokens, ...(newTokens as Record<string, unknown>) };
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
}
