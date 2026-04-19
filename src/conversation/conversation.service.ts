import { Injectable } from '@nestjs/common';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HISTORY_LIMIT = 20;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async saveMessage(
    jid: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({ data: { jid, role, content } });
  }

  async getHistory(
    jid: string,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<MessageParam[]> {
    const rows = await this.prisma.message.findMany({
      where: { jid },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }
}
