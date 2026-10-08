import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendMailDto } from './dto/send-mail.dto';
import { MailMessage } from './entities/mail-message.entity';
import { MailService } from './mail.service';

@UseGuards(JwtAuthGuard)
@Controller('characters/:characterId/mail')
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  list(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('box') box?: 'inbox' | 'sent',
  ): Promise<MailMessage[]> {
    return this.mail.list(characterId, user, box ?? 'inbox');
  }

  @Post()
  send(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: SendMailDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MailMessage> {
    return this.mail.send(characterId, user, dto);
  }

  @Get(':mailId')
  get(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('mailId', ParseUUIDPipe) mailId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MailMessage> {
    return this.mail.get(characterId, mailId, user);
  }

  @Post(':mailId/read')
  markRead(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('mailId', ParseUUIDPipe) mailId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MailMessage> {
    return this.mail.markRead(characterId, mailId, user);
  }

  @Post(':mailId/claim')
  claim(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('mailId', ParseUUIDPipe) mailId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true; items: unknown[] }> {
    return this.mail.claimAttachments(characterId, mailId, user);
  }

  @Delete(':mailId')
  remove(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('mailId', ParseUUIDPipe) mailId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    return this.mail.remove(characterId, mailId, user);
  }
}
