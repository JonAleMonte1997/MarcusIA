import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeService } from './claude/claude.service';
import { ConversationService } from './conversation/conversation.service';
import { WhatsappService } from './whatsapp/whatsapp.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly claude: ClaudeService,
  ) {}

  onModuleInit(): void {
    this.whatsapp.setHandler(async ({ jid, text }) => {
      this.logger.log(`[${jid}] ← "${text}"`);
      const history = await this.conversation.getHistory(jid);
      const reply = await this.claude.chat(history, text);
      await this.conversation.saveMessage(jid, 'user', text);
      await this.conversation.saveMessage(jid, 'assistant', reply);
      this.logger.debug(`[${jid}] user: "${text}" → assistant: "${reply.slice(0, 60)}…"`);
      return reply;
    });
  }
}
