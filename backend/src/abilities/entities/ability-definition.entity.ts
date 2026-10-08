import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('ability_definitions')
export class AbilityDefinition {
  @PrimaryColumn({ name: 'ability_key', length: 64 })
  abilityKey: string;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 32 })
  category: string;

  @Column({ name: 'cast_time_ms', type: 'integer', default: 0 })
  castTimeMs: number;

  @Column({ name: 'recast_ms', type: 'integer', default: 0 })
  recastMs: number;

  @Column({ name: 'mp_cost', type: 'integer', default: 0 })
  mpCost: number;

  @Column({ name: 'tp_cost', type: 'integer', default: 0 })
  tpCost: number;

  @Column({ type: 'real', default: 0 })
  range: number;

  @Column({ name: 'target_type', length: 32 })
  targetType: string;

  @Column({ name: 'job_required', type: 'varchar', length: 64, nullable: true })
  jobRequired: string | null;

  @Column({ name: 'min_job_level', type: 'integer', default: 1 })
  minJobLevel: number;

  @Column({ name: 'effect_script', length: 64 })
  effectScript: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;
}
