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
