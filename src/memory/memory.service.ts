import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { ClaudeService } from '../claude/claude.service';

@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);
  private readonly maxEntries: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
    private readonly claude: ClaudeService,
  ) {
    this.maxEntries = this.config.get<number>('MEMORY_MAX_ENTRIES', 50);
  }

  onModuleInit(): void {
    this.registry.register({
      definition: {
        name: 'save_memory',
        description:
          'Guarda un fact importante sobre el usuario para recordarlo en el futuro. Usá cuando el usuario diga "recordá que...", "siempre prefiero...", "guardá que..." u expresiones similares.',
        input_schema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Identificador corto en snake_case (ej: horario_reuniones)',
            },
            value: {
              type: 'string',
              description: 'Valor o descripción del fact a recordar',
            },
          },
          required: ['key', 'value'],
        },
      },
      handler: async (input, jid) => {
        await this.upsert(jid, input.key as string, input.value as string);
        return { ok: true };
      },
    });

    this.registry.register({
      definition: {
        name: 'delete_memory',
        description:
          'Elimina un fact memorizado sobre el usuario. Usá cuando el usuario diga "olvidate de...", "borrá el dato de..." u expresiones similares.',
        input_schema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key del fact a eliminar',
            },
          },
          required: ['key'],
        },
      },
      handler: async (input, jid) => {
        await this.delete(jid, input.key as string);
        return { ok: true };
      },
    });
  }

  async getAll(jid: string): Promise<{ key: string; value: string }[]> {
    const rows = await this.prisma.memory.findMany({
      where: { jid },
      orderBy: { updatedAt: 'desc' },
      select: { key: true, value: true },
    });
    return rows;
  }

  async upsert(jid: string, key: string, value: string): Promise<void> {
    await this.prisma.memory.upsert({
      where: { jid_key: { jid, key } },
      update: { value },
      create: { jid, key, value },
    });
    this.logger.log(`Memory guardada (jid=${jid}, key=${key})`);
    await this.compactIfNeeded(jid);
  }

  async delete(jid: string, key: string): Promise<void> {
    await this.prisma.memory.deleteMany({ where: { jid, key } });
    this.logger.log(`Memory eliminada (jid=${jid}, key=${key})`);
  }

  async extractAndSave(
    sessionId: string,
    jid: string,
    messages: { role: string; content: string }[],
  ): Promise<void> {
    try {
      const facts = await this.claude.extractFacts(messages);
      for (const f of facts) {
        await this.upsert(jid, f.key, f.value);
      }
      if (facts.length > 0) {
        this.logger.log(
          `Extracción de sesión ${sessionId}: ${facts.length} fact(s) guardados`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Error extrayendo facts de sesión ${sessionId}: ${(err as Error).message}`,
      );
    }
  }

  private async compactIfNeeded(jid: string): Promise<void> {
    const count = await this.prisma.memory.count({ where: { jid } });
    if (count < this.maxEntries) return;

    this.logger.log(`Compactando memoria (jid=${jid}, count=${count})`);

    const oldest = await this.prisma.memory.findMany({
      where: { jid },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    try {
      const compacted = await this.claude.compactFacts(
        oldest.map((m) => ({ key: m.key, value: m.value })),
      );

      await this.prisma.$transaction([
        this.prisma.memory.deleteMany({
          where: { id: { in: oldest.map((m) => m.id) } },
        }),
        ...compacted.map((f) =>
          this.prisma.memory.upsert({
            where: { jid_key: { jid, key: f.key } },
            update: { value: f.value },
            create: { jid, key: f.key, value: f.value },
          }),
        ),
      ]);

      this.logger.log(
        `Compactación completada: ${oldest.length} → ${compacted.length} facts`,
      );
    } catch (err) {
      this.logger.warn(`Error compactando memoria: ${(err as Error).message}`);
    }
  }
}
