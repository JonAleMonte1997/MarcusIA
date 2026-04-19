import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

@Injectable()
export class TasksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        name: 'create_task',
        description: 'Crea un recordatorio o tarea para el usuario.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título de la tarea' },
            due_at: {
              type: 'string',
              description: 'Fecha/hora límite en formato ISO8601 (opcional)',
            },
          },
          required: ['title'],
        },
      },
      handler: (input, jid) => this.createTask(jid, input),
    });

    this.registry.register({
      definition: {
        name: 'list_tasks',
        description: 'Lista las tareas del usuario.',
        input_schema: {
          type: 'object',
          properties: {
            include_done: {
              type: 'boolean',
              description: 'Incluir tareas ya completadas (default false)',
            },
          },
        },
      },
      handler: (input, jid) =>
        this.listTasks(jid, input.include_done as boolean | undefined),
    });

    this.registry.register({
      definition: {
        name: 'complete_task',
        description: 'Marca una tarea como completada.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.completeTask(input.id as number),
    });

    this.registry.register({
      definition: {
        name: 'edit_task',
        description: 'Edita el título o la fecha límite de una tarea.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
            title: { type: 'string', description: 'Nuevo título (opcional)' },
            due_at: {
              type: 'string',
              description: 'Nueva fecha límite en ISO8601 (opcional)',
            },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.editTask(input.id as number, input),
    });

    this.registry.register({
      definition: {
        name: 'delete_task',
        description: 'Elimina una tarea.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'ID de la tarea' },
          },
          required: ['id'],
        },
      },
      handler: (input) => this.deleteTask(input.id as number),
    });
  }

  async createTask(
    jid: string,
    input: Record<string, unknown>,
  ): Promise<{ id: number }> {
    const task = await this.prisma.task.create({
      data: {
        jid,
        title: input.title as string,
        dueAt: input.due_at ? new Date(input.due_at as string) : null,
      },
    });
    return { id: task.id };
  }

  async listTasks(
    jid: string,
    includeDone = false,
  ): Promise<
    { id: number; title: string; due_at: string | null; done: boolean }[]
  > {
    const tasks = await this.prisma.task.findMany({
      where: { jid, ...(includeDone ? {} : { done: false }) },
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      due_at: t.dueAt?.toISOString() ?? null,
      done: t.done,
    }));
  }

  async completeTask(id: number): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.update({ where: { id }, data: { done: true } });
    return { ok: true, id };
  }

  async editTask(
    id: number,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title as string } : {}),
        ...(input.due_at !== undefined
          ? { dueAt: input.due_at ? new Date(input.due_at as string) : null }
          : {}),
      },
    });
    return { ok: true, id };
  }

  async deleteTask(id: number): Promise<{ ok: boolean; id: number } | { error: string }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return { error: `Tarea ${id} no encontrada` };
    await this.prisma.task.delete({ where: { id } });
    return { ok: true, id };
  }
}
