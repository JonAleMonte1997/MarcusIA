import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { TelegramModule } from './telegram/telegram.module';
import { ClaudeModule } from './claude/claude.module';
import { ConversationModule } from './conversation/conversation.module';
import { ToolRegistryModule } from './tool-registry/tool-registry.module';
import { TasksModule } from './tasks/tasks.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SessionModule } from './session/session.module';
import { MemoryModule } from './memory/memory.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    ToolRegistryModule,
    WhatsappModule,
    TelegramModule,
    ClaudeModule,
    ConversationModule,
    TasksModule,
    GoogleCalendarModule,
    SessionModule,
    MemoryModule,
  ],
  providers: [AppService],
})
export class AppModule {}
