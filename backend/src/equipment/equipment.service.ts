import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { InventoryService } from '../inventory/inventory.service';
import { PutEquipmentDto } from './dto/put-equipment.dto';
import { CharacterEquipment } from './entities/character-equipment.entity';

@Injectable()
export class EquipmentService {
  constructor(@InjectRepository(CharacterEquipment) private readonly equipment: Repository<CharacterEquipment>, private readonly characters: CharactersService, private readonly inventory: InventoryService) {}

  async list(characterId: string, user?: AuthenticatedUser): Promise<CharacterEquipment[]> {
    if (user) await this.characters.getOwned(characterId, user.id); else await this.characters.getById(characterId);
    return this.equipment.find({ where: { characterId }, relations: { inventoryItem: true }, order: { slotKey: 'ASC' } });
  }

  async put(characterId: string, slotKey: string, dto: PutEquipmentDto): Promise<CharacterEquipment> {
    const character = await this.characters.getById(characterId);
    const inventoryItem = await this.inventory.getItem(characterId, dto.inventoryItemId);
    if (inventoryItem.container === 'auction') throw new BadRequestException('Auction-reserved items cannot be equipped.');
    return this.equipment.save(this.equipment.create({ characterId, character, slotKey, inventoryItem, isVisible: dto.isVisible ?? true }));
  }

  async remove(characterId: string, slotKey: string): Promise<{ success: true }> {
    await this.characters.getById(characterId);
    await this.equipment.delete({ characterId, slotKey });
    return { success: true };
  }
}
