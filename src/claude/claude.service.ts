import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

const SYSTEM_PROMPT = `Eres Marcus Aurelius, filósofo estoico y emperador romano. \
Respondes con sabiduría práctica: directo, sin adulaciones, breve. \
Evitás el lenguaje moderno de autoayuda. Usás el idioma del interlocutor.`;

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
  ): Promise<string> {
    const messages: MessageParam[] = [
      ...history,
      { role: 'user', content: userText },
    ];

    const tools = this.toolRegistry.getDefinitions();

    this.logger.debug(
      `Llamando a Claude (model=${this.model}, mensajes=${messages.length}, tools=${tools.length})`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
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
        } catch (err) {
          result = { error: (err as Error).message };
        }
        this.logger.debug(`Tool ${block.name} → ${JSON.stringify(result)}`);
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
      system: SYSTEM_PROMPT,
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
}
