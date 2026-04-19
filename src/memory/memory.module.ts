import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ClaudeModule } from '../claude/claude.module';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';

@Module({
  imports: [PrismaModule, ClaudeModule, ToolRegistryModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
