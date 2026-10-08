import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AbilityDefinitionsService } from '../abilities/abilities.service';
import { CharacterAbilitiesService } from '../abilities/character-abilities.service';
import { PutCharacterAbilityDto } from '../abilities/dto/put-character-ability.dto';
import { UpsertAbilityDefinitionDto } from '../abilities/dto/upsert-ability-definition.dto';
import { AuctionService } from '../auction/auction.service';
import { CharactersService } from '../characters/characters.service';
import { PutJobProgressDto } from '../characters/dto/put-job-progress.dto';
import { UpdateCharacterJobsDto } from '../characters/dto/update-character-jobs.dto';
import { CharacterJobProgress } from '../characters/entities/character-job-progress.entity';
import { GameCharacter } from '../characters/entities/game-character.entity';
import { ServiceAuthGuard } from '../common/guards/service-auth.guard';
import { PutEquipmentDto } from '../equipment/dto/put-equipment.dto';
import { EquipmentService } from '../equipment/equipment.service';
import { EventsService } from '../events/events.service';
import { DomainEvent } from '../events/entities/domain-event.entity';
import { CreateHousingPlotDto } from '../housing/dto/create-housing-plot.dto';
import { HousingPlot } from '../housing/entities/housing-plot.entity';
import { HousingService } from '../housing/housing.service';
import { AddInventoryItemDto } from '../inventory/dto/add-inventory-item.dto';
import { UpdateInventoryItemDto } from '../inventory/dto/update-inventory-item.dto';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryService } from '../inventory/inventory.service';
import { UpsertItemDefinitionDto } from '../items/dto/upsert-item-definition.dto';
import { ItemDefinitionsService } from '../items/items.service';
import { MailService } from '../mail/mail.service';
import { MailMessage } from '../mail/entities/mail-message.entity';
import { BatchStateDto } from '../persistence/dto/batch-state.dto';
import { PutStateDto } from '../persistence/dto/put-state.dto';
import { PersistedState } from '../persistence/entities/persisted-state.entity';
import { PersistenceService } from '../persistence/persistence.service';
import { AuthService } from '../auth/auth.service';
import { CreateCharacterPropDto } from '../props/dto/create-character-prop.dto';
import { PropsService } from '../props/props.service';
import { UpdateCharacterStatsDto } from '../stats/dto/update-character-stats.dto';
import { StatsService } from '../stats/stats.service';
import { EmitDomainEventDto } from './dto/emit-domain-event.dto';
import { GrantCurrencyDto } from './dto/grant-currency.dto';
import { InternalSendMailDto } from './dto/internal-send-mail.dto';
import { UpdateCharacterStateDto } from './dto/update-character-state.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@UseGuards(ServiceAuthGuard)
@Controller('internal')
export class InternalController {
  constructor(
    private readonly characters: CharactersService,
    private readonly inventory: InventoryService,
    private readonly mail: MailService,
    private readonly housing: HousingService,
    private readonly auctions: AuctionService,
    private readonly persistence: PersistenceService,
    private readonly events: EventsService,
    private readonly auth: AuthService,
    private readonly stats: StatsService,
    private readonly equipment: EquipmentService,
    private readonly abilities: CharacterAbilitiesService,
    private readonly abilityDefinitions: AbilityDefinitionsService,
    private readonly items: ItemDefinitionsService,
    private readonly props: PropsService,
  ) {}

  @Get('accounts')
  listAccounts(@Query('search') search?: string) {
    return this.auth.listAccounts(search);
  }

  @Patch('accounts/:accountId')
  updateAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.auth.updateAccount(accountId, dto);
  }

  @Get('characters/:characterId')
  getCharacter(
    @Param('characterId', ParseUUIDPipe) characterId: string,
  ): Promise<GameCharacter> {
    return this.characters.getById(characterId);
  }

  @Patch('characters/:characterId/state')
  updateCharacterState(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: UpdateCharacterStateDto,
  ): Promise<GameCharacter> {
    return this.characters.updateForGameServer(characterId, dto);
  }

  @Get('characters/:characterId/jobs')
  listCharacterJobs(
    @Param('characterId', ParseUUIDPipe) characterId: string,
  ): Promise<CharacterJobProgress[]> {
    return this.characters.listJobs(characterId);
  }

  @Put('characters/:characterId/jobs/:jobKey')
  putCharacterJobProgress(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('jobKey') jobKey: string,
    @Body() dto: PutJobProgressDto,
  ): Promise<CharacterJobProgress> {
    return this.characters.putJobProgress(characterId, jobKey, dto);
  }

  @Patch('characters/:characterId/jobs')
  updateCharacterJobs(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: UpdateCharacterJobsDto,
  ): Promise<GameCharacter> {
    return this.characters.setJobs(characterId, dto);
  }

  @Get('characters/:characterId/stats')
  listStats(@Param('characterId', ParseUUIDPipe) characterId: string) { return this.stats.list(characterId); }

  @Patch('characters/:characterId/stats')
  updateStats(@Param('characterId', ParseUUIDPipe) characterId: string, @Body() dto: UpdateCharacterStatsDto) { return this.stats.update(characterId, dto); }

  @Get('characters/:characterId/equipment')
  listEquipment(@Param('characterId', ParseUUIDPipe) characterId: string) { return this.equipment.list(characterId); }

  @Put('characters/:characterId/equipment/:slot')
  putEquipment(@Param('characterId', ParseUUIDPipe) characterId: string, @Param('slot') slot: string, @Body() dto: PutEquipmentDto) { return this.equipment.put(characterId, slot, dto); }

  @Delete('characters/:characterId/equipment/:slot')
  removeEquipment(@Param('characterId', ParseUUIDPipe) characterId: string, @Param('slot') slot: string) { return this.equipment.remove(characterId, slot); }

  @Get('characters/:characterId/abilities')
  listAbilities(@Param('characterId', ParseUUIDPipe) characterId: string) { return this.abilities.list(characterId); }

  @Put('characters/:characterId/abilities/:key')
  putAbility(@Param('characterId', ParseUUIDPipe) characterId: string, @Param('key') key: string, @Body() dto: PutCharacterAbilityDto) { return this.abilities.put(characterId, key, dto); }

  @Get('characters/:characterId/hotbar')
  getHotbar(@Param('characterId', ParseUUIDPipe) characterId: string) { return this.persistence.get('hotbar', characterId, 'slots'); }

  @Put('characters/:characterId/hotbar')
  async putHotbar(@Param('characterId', ParseUUIDPipe) characterId: string, @Body() dto: PutStateDto) {
    await this.characters.getById(characterId);
    return this.persistence.put('hotbar', characterId, 'slots', dto);
  }

  @Get('characters/:characterId/props')
  listProps(@Param('characterId', ParseUUIDPipe) characterId: string) { return this.props.list(characterId); }

  @Post('characters/:characterId/props')
  createProp(@Param('characterId', ParseUUIDPipe) characterId: string, @Body() dto: CreateCharacterPropDto) { return this.props.create(characterId, dto); }

  @Delete('characters/:characterId/props/:propId')
  removeProp(@Param('characterId', ParseUUIDPipe) characterId: string, @Param('propId', ParseUUIDPipe) propId: string) { return this.props.remove(characterId, propId); }

  @Get('items/:itemKey')
  getItemDefinition(@Param('itemKey') itemKey: string) { return this.items.get(itemKey); }

  @Post('items')
  upsertItemDefinition(@Body() dto: UpsertItemDefinitionDto) { return this.items.upsert(dto); }

  @Get('abilities/:abilityKey')
  getAbilityDefinition(@Param('abilityKey') abilityKey: string) { return this.abilityDefinitions.get(abilityKey); }

  @Post('abilities')
  upsertAbilityDefinition(@Body() dto: UpsertAbilityDefinitionDto) { return this.abilityDefinitions.upsert(dto); }

  @Post('characters/:characterId/currency')
  grantCurrency(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: GrantCurrencyDto,
  ): Promise<GameCharacter> {
    return this.characters.grantCurrency(characterId, dto.amount);
  }

  @Get('characters/:characterId/inventory')
  listInventory(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Query('container') container?: string,
  ): Promise<InventoryItem[]> {
    return this.inventory.listForCharacter(characterId, container);
  }

  @Post('characters/:characterId/inventory/items')
  async addInventoryItem(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: AddInventoryItemDto,
  ): Promise<InventoryItem> {
    const character = await this.characters.getById(characterId);
    return this.inventory.addForCharacter(character, dto);
  }

  @Patch('characters/:characterId/inventory/items/:itemId')
  updateInventoryItem(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    return this.inventory.updateForCharacter(characterId, itemId, dto);
  }

  @Delete('characters/:characterId/inventory/items/:itemId')
  removeInventoryItem(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<{ success: true }> {
    return this.inventory.removeForCharacter(characterId, itemId);
  }

  @Post('mail')
  sendMail(@Body() dto: InternalSendMailDto): Promise<MailMessage> {
    return this.mail.sendInternal(dto);
  }

  @Post('housing/plots')
  createHousingPlot(
    @Body() dto: CreateHousingPlotDto,
  ): Promise<HousingPlot> {
    return this.housing.createPlot(dto);
  }

  @Post('auctions/process-expired')
  processExpiredAuctions(): Promise<{ processed: number }> {
    return this.auctions.processExpired();
  }

  @Get('state/:scope/:scopeId')
  listState(
    @Param('scope') scope: string,
    @Param('scopeId') scopeId: string,
  ): Promise<PersistedState[]> {
    return this.persistence.list(scope, scopeId);
  }

  @Get('state/:scope/:scopeId/:key')
  getState(
    @Param('scope') scope: string,
    @Param('scopeId') scopeId: string,
    @Param('key') key: string,
  ): Promise<PersistedState> {
    return this.persistence.get(scope, scopeId, key);
  }

  @Put('state/:scope/:scopeId/:key')
  putState(
    @Param('scope') scope: string,
    @Param('scopeId') scopeId: string,
    @Param('key') key: string,
    @Body() dto: PutStateDto,
  ): Promise<PersistedState> {
    return this.persistence.put(scope, scopeId, key, dto);
  }

  @Post('state/:scope/:scopeId/batch')
  batchState(
    @Param('scope') scope: string,
    @Param('scopeId') scopeId: string,
    @Body() dto: BatchStateDto,
  ): Promise<PersistedState[]> {
    return this.persistence.batch(scope, scopeId, dto);
  }

  @Delete('state/:scope/:scopeId/:key')
  removeState(
    @Param('scope') scope: string,
    @Param('scopeId') scopeId: string,
    @Param('key') key: string,
  ): Promise<{ success: true }> {
    return this.persistence.remove(scope, scopeId, key);
  }

  @Get('events')
  listEvents(@Query('unprocessed') unprocessed?: string): Promise<DomainEvent[]> {
    return this.events.list(unprocessed !== 'false');
  }

  @Post('auth/verify')
  async verifyAccessToken(@Body('accessToken') accessToken: string) {
    return this.auth.verifyAccessToken(accessToken);
  }

  @Post('events')
  emitEvent(@Body() dto: EmitDomainEventDto): Promise<DomainEvent> {
    return this.events.record(
      dto.type,
      dto.aggregateType,
      dto.aggregateId,
      dto.payload,
      undefined,
      dto.idempotencyKey,
    );
  }

  @Post('events/:eventId/processed')
  markEventProcessed(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<DomainEvent> {
    return this.events.markProcessed(eventId);
  }
}
