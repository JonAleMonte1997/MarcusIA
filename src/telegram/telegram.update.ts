import { Update, On, Context } from 'nestjs-telegraf';
import type { Context as TelegrafContext } from 'telegraf';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}

  @On('text')
  async onText(@Context() ctx: TelegrafContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const text = (ctx.message as { text?: string } | undefined)?.text;
    if (!text) return;
    await this.telegramService.handleText(chatId, text);
  }
}
