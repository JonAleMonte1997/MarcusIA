import { Injectable, Logger } from '@nestjs/common';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export interface RegisteredTool {
  definition: Tool;
  handler: (input: Record<string, unknown>, jid: string) => Promise<unknown>;
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
    this.logger.debug(`Tool registrada: ${tool.definition.name}`);
  }

  getDefinitions(): Tool[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    jid: string,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool desconocida: ${name}`);
    return tool.handler(input, jid);
  }
}
