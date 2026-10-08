import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpsertItemDefinitionDto } from './dto/upsert-item-definition.dto';
import { ItemDefinition } from './entities/item-definition.entity';

@Injectable()
export class ItemDefinitionsService implements OnModuleInit {
  constructor(@InjectRepository(ItemDefinition) private readonly definitions: Repository<ItemDefinition>) {}

  async onModuleInit(): Promise<void> {
    if (await this.definitions.count()) return;
    await this.definitions.save([
      this.definitions.create({ itemKey: 'bronze sword', name: 'Bronze Sword', category: 'weapon', equipSlot: 'main_hand', maxStack: 1, jobRequired: null, minLevel: 1, statsBonus: { attack: 3 }, useAbility: null, metadata: null }),
      this.definitions.create({ itemKey: 'minor potion', name: 'Minor Potion', category: 'consumable', equipSlot: null, maxStack: 99, jobRequired: null, minLevel: 1, statsBonus: null, useAbility: 'minor heal', metadata: null }),
    ]);
  }

  async get(itemKey: string): Promise<ItemDefinition> {
    const definition = await this.definitions.findOneBy({ itemKey: itemKey.toLowerCase() });
    if (!definition) throw new NotFoundException('Item definition was not found.');
    return definition;
  }

  upsert(dto: UpsertItemDefinitionDto): Promise<ItemDefinition> {
    return this.definitions.save(this.definitions.create({ ...dto, itemKey: dto.itemKey.toLowerCase(), equipSlot: dto.equipSlot ?? null, jobRequired: dto.jobRequired ?? null, statsBonus: dto.statsBonus ?? null, useAbility: dto.useAbility ?? null, metadata: dto.metadata ?? null }));
  }
}
