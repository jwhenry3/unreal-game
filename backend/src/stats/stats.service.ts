import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { UpdateCharacterStatsDto } from './dto/update-character-stats.dto';
import { CharacterStat } from './entities/character-stat.entity';

@Injectable()
export class StatsService {
  constructor(@InjectRepository(CharacterStat) private readonly stats: Repository<CharacterStat>, private readonly characters: CharactersService) {}

  async list(characterId: string, user?: AuthenticatedUser): Promise<CharacterStat[]> {
    if (user) await this.characters.getOwned(characterId, user.id); else await this.characters.getById(characterId);
    return this.stats.find({ where: { characterId }, order: { statKey: 'ASC' } });
  }

  async update(characterId: string, dto: UpdateCharacterStatsDto): Promise<CharacterStat[]> {
    const character = await this.characters.getById(characterId);
    await this.stats.manager.transaction(async (manager) => {
      const repository = manager.getRepository(CharacterStat);
      for (const update of dto.stats) {
        const row = await repository.findOneBy({ characterId, statKey: update.statKey });
        await repository.save(repository.create({ characterId, character, statKey: update.statKey, baseValue: update.baseValue ?? row?.baseValue ?? 0, bonusValue: update.bonusValue ?? row?.bonusValue ?? 0, currentValue: update.currentValue ?? row?.currentValue ?? 0 }));
      }
    });
    return this.list(characterId);
  }
}
