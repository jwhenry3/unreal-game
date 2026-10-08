import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { GameCharacter } from '../characters/entities/game-character.entity';
import { AddInventoryItemDto } from './dto/add-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItem } from './entities/inventory-item.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
    private readonly characters: CharactersService,
  ) {}

  async list(
    characterId: string,
    user: AuthenticatedUser,
    container?: string,
  ): Promise<InventoryItem[]> {
    await this.characters.getOwned(characterId, user.id);
    return this.items.find({
      where: {
        character: { id: characterId },
        ...(container ? { container } : {}),
      },
      order: { container: 'ASC', slotIndex: 'ASC', createdAt: 'ASC' },
    });
  }

  async add(
    characterId: string,
    user: AuthenticatedUser,
    dto: AddInventoryItemDto,
  ): Promise<InventoryItem> {
    const character = await this.characters.getOwned(characterId, user.id);
    return this.addForCharacter(character, dto);
  }

  async addForCharacter(
    character: GameCharacter,
    dto: AddInventoryItemDto,
    manager?: EntityManager,
  ): Promise<InventoryItem> {
    const repository = manager?.getRepository(InventoryItem) ?? this.items;
    const item = repository.create({
      character,
      container: dto.container ?? 'inventory',
      slotIndex: dto.slotIndex ?? null,
      itemKey: dto.itemKey.trim(),
      quantity: dto.quantity,
      durability: dto.durability ?? null,
      metadata: dto.metadata ?? null,
      isBound: dto.isBound ?? false,
    });

    try {
      return await repository.save(item);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('That inventory slot is already occupied.');
      }
      throw error;
    }
  }

  async update(
    characterId: string,
    itemId: string,
    user: AuthenticatedUser,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    await this.characters.getOwned(characterId, user.id);
    const item = await this.getItem(characterId, itemId);

    if (dto.container !== undefined) item.container = dto.container;
    if (dto.slotIndex !== undefined) item.slotIndex = dto.slotIndex;
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.durability !== undefined) item.durability = dto.durability;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;
    if (dto.isBound !== undefined) item.isBound = dto.isBound;

    try {
      return await this.items.save(item);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('That inventory slot is already occupied.');
      }
      throw error;
    }
  }

  async remove(
    characterId: string,
    itemId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.characters.getOwned(characterId, user.id);
    const item = await this.getItem(characterId, itemId);
    if (item.container === 'auction') {
      throw new BadRequestException('Auction-reserved items cannot be deleted.');
    }

    await this.items.remove(item);
    return { success: true };
  }

  async listForCharacter(
    characterId: string,
    container?: string,
  ): Promise<InventoryItem[]> {
    await this.characters.getById(characterId);
    return this.items.find({
      where: {
        character: { id: characterId },
        ...(container ? { container } : {}),
      },
      order: { container: 'ASC', slotIndex: 'ASC', createdAt: 'ASC' },
    });
  }

  async updateForCharacter(
    characterId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItem> {
    await this.characters.getById(characterId);
    const item = await this.getItem(characterId, itemId);
    if (dto.container !== undefined) item.container = dto.container;
    if (dto.slotIndex !== undefined) item.slotIndex = dto.slotIndex;
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.durability !== undefined) item.durability = dto.durability;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;
    if (dto.isBound !== undefined) item.isBound = dto.isBound;

    try {
      return await this.items.save(item);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('That inventory slot is already occupied.');
      }
      throw error;
    }
  }

  async removeForCharacter(
    characterId: string,
    itemId: string,
  ): Promise<{ success: true }> {
    await this.characters.getById(characterId);
    const item = await this.getItem(characterId, itemId);
    await this.items.remove(item);
    return { success: true };
  }

  async getItem(characterId: string, itemId: string): Promise<InventoryItem> {
    const item = await this.items.findOne({
      where: { id: itemId, character: { id: characterId } },
      relations: { character: true },
    });

    if (!item) {
      throw new NotFoundException('Inventory item was not found.');
    }

    return item;
  }

  async moveToContainer(
    manager: EntityManager,
    item: InventoryItem,
    character: GameCharacter,
    container: string,
  ): Promise<InventoryItem> {
    item.character = character;
    item.container = container;
    item.slotIndex = null;
    return manager.getRepository(InventoryItem).save(item);
  }
}
