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
    // tools se registran en los tasks siguientes
  }
}
