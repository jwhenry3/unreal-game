import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameCharacter } from './game-character.entity';

@Entity('character_job_progress')
@Index(['character', 'jobKey'], { unique: true })
export class CharacterJobProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => GameCharacter, (character) => character.jobProgress, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @Column({ name: 'job_key', length: 64 })
  jobKey: string;

  @Column({ type: 'integer', default: 1 })
  level: number;

  @Column({ type: 'integer', default: 0 })
  experience: number;

  @Column({ name: 'is_unlocked', type: 'boolean', default: true })
  isUnlocked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
