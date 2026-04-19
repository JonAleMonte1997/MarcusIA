import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { ConversationService } from '../conversation/conversation.service';
import type { Session } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly timeoutHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memory: MemoryService,
    private readonly conversation: ConversationService,
  ) {
    this.timeoutHours = this.config.get<number>('SESSION_TIMEOUT_HOURS', 6);
  }

  async getOrCreate(jid: string): Promise<Session> {
    const open = await this.prisma.session.findFirst({
      where: { jid, closedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (open) {
      const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
      if (open.lastActivityAt < cutoff) {
        await this.closeAndExtract(open, 'timeout');
        return this.createSession(jid);
      }
      return open;
    }

    return this.createSession(jid);
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() },
    });
  }

  @Cron('0 * * * *')
  async expireStale(): Promise<void> {
    const cutoff = new Date(Date.now() - this.timeoutHours * 3_600_000);
    const stale = await this.prisma.session.findMany({
      where: { closedAt: null, lastActivityAt: { lt: cutoff } },
    });

    for (const session of stale) {
      await this.closeAndExtract(session, 'cron');
    }

    if (stale.length > 0) {
      this.logger.log(`Cron: ${stale.length} sesión(es) expirada(s)`);
    }
  }

  private async closeAndExtract(session: Session, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: session.id },
      data: { closedAt: new Date() },
    });
    this.logger.log(`Sesión cerrada (id=${session.id}, jid=${session.jid}, motivo=${reason})`);

    const messages = await this.conversation.getSessionMessages(session.id);
    void this.memory.extractAndSave(session.id, session.jid, messages);
  }

  private async createSession(jid: string): Promise<Session> {
    const session = await this.prisma.session.create({ data: { jid } });
    this.logger.log(`Nueva sesión creada (jid=${jid}, id=${session.id})`);
    return session;
  }
}
