import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';

@Entity('character_abilities')
export class CharacterAbility {
  @PrimaryColumn({ name: 'character_id', type: 'varchar' })
  characterId: string;

  @PrimaryColumn({ name: 'ability_key', length: 64 })
  abilityKey: string;

  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @Column({ type: 'integer', default: 1 })
  rank: number;

  @Column({ name: 'is_unlocked', type: 'boolean', default: true })
  isUnlocked: boolean;

  @Column({ name: 'source_job', type: 'varchar', length: 64, nullable: true })
  sourceJob: string | null;

  @Column({ name: 'cooldown_at', type: 'datetime', nullable: true })
  cooldownAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
