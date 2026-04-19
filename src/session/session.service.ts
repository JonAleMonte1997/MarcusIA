import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Session } from '@prisma/client';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly timeoutHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
        await this.closeSession(open.id, 'timeout');
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

  async closeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { closedAt: new Date() },
    });
    this.logger.log(`Sesión cerrada (id=${sessionId}, motivo=${reason})`);
  }

  async getSessionMessages(sessionId: string): Promise<{ role: string; content: string }[]> {
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
  }

  private async createSession(jid: string): Promise<Session> {
    const session = await this.prisma.session.create({ data: { jid } });
    this.logger.log(`Nueva sesión creada (jid=${jid}, id=${session.id})`);
    return session;
  }
}
