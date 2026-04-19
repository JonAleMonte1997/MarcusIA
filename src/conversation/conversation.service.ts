import { Injectable } from '@nestjs/common';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_HISTORY_LIMIT = 30;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSession(
    sessionId: string,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<MessageParam[]> {
    const rows = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }

  async saveMessage(
    sessionId: string,
    jid: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({
      data: { sessionId, jid, role, content },
    });
  }

  async getSessionMessages(
    sessionId: string,
  ): Promise<{ role: string; content: string }[]> {
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
  }
}
