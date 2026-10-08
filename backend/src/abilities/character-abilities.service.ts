import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { PutCharacterAbilityDto } from './dto/put-character-ability.dto';
import { CharacterAbility } from './entities/character-ability.entity';
import { AbilityDefinitionsService } from './abilities.service';

@Injectable()
export class CharacterAbilitiesService {
  constructor(@InjectRepository(CharacterAbility) private readonly abilities: Repository<CharacterAbility>, private readonly characters: CharactersService, private readonly definitions: AbilityDefinitionsService) {}

  async list(characterId: string, user?: AuthenticatedUser): Promise<CharacterAbility[]> {
    if (user) await this.characters.getOwned(characterId, user.id); else await this.characters.getById(characterId);
    return this.abilities.find({ where: { characterId }, order: { abilityKey: 'ASC' } });
  }

  async put(characterId: string, abilityKey: string, dto: PutCharacterAbilityDto): Promise<CharacterAbility> {
    const character = await this.characters.getById(characterId);
    const key = abilityKey.toLowerCase();
    await this.definitions.get(key);
    const existing = await this.abilities.findOneBy({ characterId, abilityKey: key });
    return this.abilities.save(this.abilities.create({ characterId, character, abilityKey: key, rank: dto.rank ?? existing?.rank ?? 1, isUnlocked: dto.isUnlocked ?? existing?.isUnlocked ?? true, sourceJob: dto.sourceJob ?? existing?.sourceJob ?? null, cooldownAt: dto.cooldownAt === null ? null : dto.cooldownAt ? new Date(dto.cooldownAt) : existing?.cooldownAt ?? null }));
  }
}
