import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('item_definitions')
export class ItemDefinition {
  @PrimaryColumn({ name: 'item_key', length: 64 })
  itemKey: string;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 32 })
  category: string;

  @Column({ name: 'equip_slot', type: 'varchar', length: 32, nullable: true })
  equipSlot: string | null;

  @Column({ name: 'max_stack', type: 'integer', default: 1 })
  maxStack: number;

  @Column({ name: 'job_required', type: 'varchar', length: 64, nullable: true })
  jobRequired: string | null;

  @Column({ name: 'min_level', type: 'integer', default: 1 })
  minLevel: number;

  @Column({ name: 'stats_bonus', type: 'simple-json', nullable: true })
  statsBonus: Record<string, number> | null;

  @Column({ name: 'use_ability', type: 'varchar', length: 64, nullable: true })
  useAbility: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;
}
