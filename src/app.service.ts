import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeService } from './claude/claude.service';
import { ConversationService } from './conversation/conversation.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { SessionService } from './session/session.service';
import { MemoryService } from './memory/memory.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly claude: ClaudeService,
    private readonly session: SessionService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit(): void {
    this.whatsapp.setHandler(async ({ jid, text }) => {
      try {
        const activeSession = await this.session.getOrCreate(jid);
        const sessionId = activeSession.id;

        this.logger.log(
          `[${jid}] ← "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" (session=${sessionId})`,
        );

        const [history, memories] = await Promise.all([
          this.conversation.getSession(sessionId),
          this.memory.getAll(jid),
        ]);

        const reply = await this.claude.chat(history, text, jid, memories);

        await this.session.touch(sessionId);
        await Promise.all([
          this.conversation.saveMessage(sessionId, jid, 'user', text),
          this.conversation.saveMessage(sessionId, jid, 'assistant', reply),
        ]);

        return reply;
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Error procesando mensaje de ${jid}: ${error.message}`,
          error.stack,
        );

        if (error.message.includes('rate limit') || error.message.includes('529')) {
          return 'Marcus está saturado en este momento. Intentá en un minuto.';
        }
        return 'Marcus tuvo un problema procesando tu mensaje. Si persiste, revisá los logs.';
      }
    });
  }
}
