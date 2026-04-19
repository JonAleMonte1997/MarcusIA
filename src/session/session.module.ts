import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MemoryModule } from '../memory/memory.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [PrismaModule, MemoryModule, ConversationModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
