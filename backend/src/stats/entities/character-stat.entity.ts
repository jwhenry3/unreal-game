import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';

@Entity('character_stats')
export class CharacterStat {
  @PrimaryColumn({ name: 'character_id', type: 'varchar' })
  characterId: string;

  @PrimaryColumn({ name: 'stat_key', length: 64 })
  statKey: string;

  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @Column({ name: 'base_value', type: 'real', default: 0 })
  baseValue: number;

  @Column({ name: 'bonus_value', type: 'real', default: 0 })
  bonusValue: number;

  @Column({ name: 'current_value', type: 'real', default: 0 })
  currentValue: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
