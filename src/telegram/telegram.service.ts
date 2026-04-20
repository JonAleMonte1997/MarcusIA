import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { InboundMessage, MessageHandler } from '../messaging.types';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly ownerChatId: number;
  private handler: MessageHandler = ({ text }) => `pong · ${text}`;

  constructor(
    private readonly config: ConfigService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.ownerChatId = this.config.get<number>('OWNER_TELEGRAM_CHAT_ID', 0);
    if (!this.ownerChatId) {
      this.logger.warn('OWNER_TELEGRAM_CHAT_ID no configurado — todos los mensajes de Telegram serán ignorados.');
    }
  }

  setHandler(fn: MessageHandler): void {
    this.handler = fn;
  }

  async handleText(chatId: number, text: string): Promise<void> {
    if (chatId !== this.ownerChatId) {
      this.logger.debug(`Ignorado mensaje de chatId no autorizado: ${chatId}`);
      return;
    }

    try {
      await this.bot.telegram.sendChatAction(chatId, 'typing');
      const reply = await this.handler({ text, jid: String(chatId) });
      if (reply) {
        await this.bot.telegram.sendMessage(chatId, reply);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Handler falló para "${text}": ${error.message}`, error.stack);
      await this.bot.telegram
        .sendMessage(chatId, '⚠️ Marcus tuvo un error procesando tu mensaje.')
        .catch(() => undefined);
    }
  }
}
