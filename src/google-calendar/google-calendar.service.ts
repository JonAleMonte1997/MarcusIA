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
}
