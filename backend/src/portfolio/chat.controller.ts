import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import type { ChatMessageDto } from './portfolio.types';
import { VaultOwnerGuard } from '../auth/wallet-auth.guard';

/**
 * Mounted at `/agent/chat` to match the frontend client. The agent SERVICE stays
 * OpenRouter-only; this orchestration (snapshot + persistence) lives with the
 * portfolio module that owns the context.
 */
@Controller('agent')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('chat')
  @UseGuards(VaultOwnerGuard)
  ask(@Body() dto: ChatDto): Promise<ChatMessageDto> {
    return this.chat.ask(dto.vaultHash, dto.message);
  }
}
