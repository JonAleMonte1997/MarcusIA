import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

function buildSystemPrompt(memories: { key: string; value: string }[]): string {
  const now = new Date();
  const fechaHora = now.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const memoriesBlock =
    memories.length > 0
      ? `\n\nLo que sé de vos:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`
      : '';

  return `Eres Marcus Aurelius, filósofo estoico y emperador romano. \
Respondes con sabiduría práctica: directo, sin adulaciones, breve. \
Evitás el lenguaje moderno de autoayuda. Usás el idioma del interlocutor.

Zona horaria del usuario: America/Argentina/Buenos_Aires (UTC-3).
Fecha y hora actual: ${fechaHora}.
Cuando el usuario diga "hoy", "mañana", "esta semana" u otras referencias temporales, \
usá esta fecha como base. Siempre incluí el offset -03:00 en las fechas ISO8601 que \
pases a las tools.${memoriesBlock}`;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistryService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.model = this.config.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6');
    this.maxTokens = this.config.get<number>('CLAUDE_MAX_TOKENS', 1024);
  }

  async chat(
    history: MessageParam[],
    userText: string,
    jid: string,
    memories: { key: string; value: string }[] = [],
  ): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    const tools = this.toolRegistry.getDefinitions();
    const systemPrompt = buildSystemPrompt(memories);

    this.logger.log(
      `Claude llamado (model=${this.model}, msgs=${messages.length}, tools=${tools.length}, memories=${memories.length})`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    if (response.stop_reason !== 'tool_use') {
      const block = response.content[0];
      if (block.type !== 'text') {
        throw new Error(`Bloque inesperado de Claude: ${block.type}`);
      }
      return block.text;
    }

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result: unknown;
        try {
          result = await this.toolRegistry.execute(
            block.name,
            block.input as Record<string, unknown>,
            jid,
          );
          this.logger.log(`Tool ejecutada: ${block.name} → ok`);
        } catch (err) {
          const msg = (err as Error).message;
          this.logger.warn(`Tool ${block.name} falló: ${msg}`);
          result = { error: msg };
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      }),
    );

    const messagesWithResults: MessageParam[] = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    const finalResponse = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messagesWithResults,
      ...(tools.length > 0 ? { tools } : {}),
    });

    const textBlock = finalResponse.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      this.logger.warn('Claude no devolvió texto en la segunda llamada');
      return 'Listo.';
    }
    return textBlock.text;
  }

  async extractFacts(
    messages: { role: string; content: string }[],
  ): Promise<{ key: string; value: string }[]> {
    if (messages.length === 0) return [];

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Marcus'}: ${m.content}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Analizá esta conversación y extraé máximo 3 facts nuevos o actualizados que valga la pena recordar del usuario (preferencias, contexto personal, proyectos, etc.). Usá keys cortas en snake_case. Devolvé SOLO un JSON array con el formato [{"key": "string", "value": "string"}]. Si no hay nada relevante, devolvé [].

Conversación:
${transcript}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    try {
      const parsed = JSON.parse(text.text.trim()) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as { key: string; value: string }[]).filter(
        (f) => typeof f.key === 'string' && typeof f.value === 'string',
      );
    } catch {
      return [];
    }
  }

  async compactFacts(
    facts: { key: string; value: string }[],
  ): Promise<{ key: string; value: string }[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Estos son facts memorizados sobre el usuario. Compactalos en máximo 10, fusionando los relacionados y descartando los obsoletos o redundantes. Devolvé SOLO un JSON array [{"key": "string", "value": "string"}].

Facts actuales:
${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return facts;

    try {
      const parsed = JSON.parse(text.text.trim()) as unknown;
      if (!Array.isArray(parsed)) return facts;
      return (parsed as { key: string; value: string }[]).filter(
        (f) => typeof f.key === 'string' && typeof f.value === 'string',
      );
    } catch {
      return facts;
    }
  }
}
