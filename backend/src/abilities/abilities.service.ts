import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpsertAbilityDefinitionDto } from './dto/upsert-ability-definition.dto';
import { AbilityDefinition } from './entities/ability-definition.entity';

@Injectable()
export class AbilityDefinitionsService implements OnModuleInit {
  constructor(@InjectRepository(AbilityDefinition) private readonly definitions: Repository<AbilityDefinition>) {}

  async onModuleInit(): Promise<void> {
    if (await this.definitions.count()) return;
    await this.definitions.save([
      this.definitions.create({ abilityKey: 'minor heal', name: 'Minor Heal', category: 'spell', castTimeMs: 0, recastMs: 2500, mpCost: 5, tpCost: 0, range: 20, targetType: 'friendly', jobRequired: null, minJobLevel: 1, effectScript: 'minor_heal', metadata: { potency: 25 } }),
      this.definitions.create({ abilityKey: 'basic attack', name: 'Basic Attack', category: 'weapon_skill', castTimeMs: 0, recastMs: 2000, mpCost: 0, tpCost: 0, range: 3, targetType: 'enemy', jobRequired: null, minJobLevel: 1, effectScript: 'basic_attack', metadata: { potency: 10 } }),
    ]);
  }

  async get(abilityKey: string): Promise<AbilityDefinition> {
    const definition = await this.definitions.findOneBy({ abilityKey: abilityKey.toLowerCase() });
    if (!definition) throw new NotFoundException('Ability definition was not found.');
    return definition;
  }

  upsert(dto: UpsertAbilityDefinitionDto): Promise<AbilityDefinition> {
    return this.definitions.save(this.definitions.create({ ...dto, abilityKey: dto.abilityKey.toLowerCase(), jobRequired: dto.jobRequired ?? null, metadata: dto.metadata ?? null }));
  }
}
