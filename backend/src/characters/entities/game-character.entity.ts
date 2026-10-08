import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { CharacterJobProgress } from './character-job-progress.entity';

@Entity('characters')
@Index(['realm', 'name'], { unique: true })
export class GameCharacter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: User;

  @Column({ length: 32 })
  name: string;

  @Column({ length: 64 })
  realm: string;

  @Column({ name: 'main_job', type: 'varchar', length: 64, default: 'Adventurer' })
  mainJob: string;

  @Column({ name: 'sub_job', type: 'varchar', length: 64, nullable: true })
  subJob: string | null;

  @Column({ type: 'integer', default: 0 })
  currency: number;

  @Column({ name: 'map_name', type: 'varchar', length: 128, nullable: true })
  mapName: string | null;

  @Column({ type: 'simple-json', nullable: true })
  position: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  state: Record<string, unknown> | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'last_played_at', type: 'datetime', nullable: true })
  lastPlayedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(
    () => CharacterJobProgress,
    (progress) => progress.character,
  )
  jobProgress: CharacterJobProgress[];
}
