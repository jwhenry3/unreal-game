import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CharacterAbilitiesService } from '../abilities/character-abilities.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EquipmentService } from '../equipment/equipment.service';
import { PersistenceService } from '../persistence/persistence.service';
import { PropsService } from '../props/props.service';
import { StatsService } from '../stats/stats.service';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { GameCharacter } from './entities/game-character.entity';

@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  constructor(
    private readonly characters: CharactersService,
    private readonly stats: StatsService,
    private readonly equipment: EquipmentService,
    private readonly abilities: CharacterAbilitiesService,
    private readonly props: PropsService,
    private readonly persistence: PersistenceService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<GameCharacter[]> {
    return this.characters.listForAccount(user.id);
  }

  @Post()
  create(
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GameCharacter> {
    return this.characters.create(dto, user);
  }

  @Get(':characterId')
  get(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GameCharacter> {
    return this.characters.getOwned(characterId, user.id);
  }

  @Get(':characterId/stats')
  listStats(@Param('characterId', ParseUUIDPipe) characterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stats.list(characterId, user);
  }

  @Get(':characterId/equipment')
  listEquipment(@Param('characterId', ParseUUIDPipe) characterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.equipment.list(characterId, user);
  }

  @Get(':characterId/abilities')
  listAbilities(@Param('characterId', ParseUUIDPipe) characterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.abilities.list(characterId, user);
  }

  @Get(':characterId/props')
  listProps(@Param('characterId', ParseUUIDPipe) characterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.props.list(characterId, user);
  }

  @Get(':characterId/hotbar')
  async getHotbar(@Param('characterId', ParseUUIDPipe) characterId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.characters.getOwned(characterId, user.id);
    return this.persistence.get('hotbar', characterId, 'slots');
  }

  @Post(':characterId/enter')
  enter(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GameCharacter> {
    return this.characters.markPlayed(characterId, user.id);
  }

  @Delete(':characterId')
  remove(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    return this.characters.softDelete(characterId, user.id);
  }
}
