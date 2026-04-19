import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ClaudeModule } from './claude/claude.module';
import { ConversationModule } from './conversation/conversation.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WhatsappModule,
    ClaudeModule,
    ConversationModule,
  ],
  providers: [AppService],
})
export class AppModule {}
