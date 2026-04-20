import { Update, On, Context } from 'nestjs-telegraf';
import { TelegramService } from './telegram.service';

@Update()
export class TelegramUpdate {
  constructor(private readonly telegramService: TelegramService) {}

  @On('text')
  async onText(@Context() ctx: any): Promise<void> {
    const chatId: number = ctx.chat.id;
    const text: string = ctx.message.text;
    await this.telegramService.handleText(chatId, text);
  }
}
