import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateCharacterPropDto } from './dto/create-character-prop.dto';
import { CharacterProp } from './entities/character-prop.entity';

@Injectable()
export class PropsService {
  constructor(@InjectRepository(CharacterProp) private readonly props: Repository<CharacterProp>, private readonly characters: CharactersService, private readonly inventory: InventoryService) {}

  async list(characterId: string, user?: AuthenticatedUser): Promise<CharacterProp[]> {
    if (user) await this.characters.getOwned(characterId, user.id); else await this.characters.getById(characterId);
    return this.props.find({ where: { character: { id: characterId } }, relations: { inventoryItem: true }, order: { createdAt: 'ASC' } });
  }

  async create(characterId: string, dto: CreateCharacterPropDto): Promise<CharacterProp> {
    const character = await this.characters.getById(characterId);
    const inventoryItem = dto.inventoryItemId ? await this.inventory.getItem(characterId, dto.inventoryItemId) : null;
    return this.props.save(this.props.create({ character, inventoryItem, propKey: dto.propKey, transform: dto.transform, isMounted: dto.isMounted ?? true, metadata: dto.metadata ?? null }));
  }

  async remove(characterId: string, propId: string): Promise<{ success: true }> {
    await this.characters.getById(characterId);
    const prop = await this.props.findOne({ where: { id: propId, character: { id: characterId } } });
    if (!prop) throw new NotFoundException('Character prop was not found.');
    await this.props.remove(prop);
    return { success: true };
  }
}
