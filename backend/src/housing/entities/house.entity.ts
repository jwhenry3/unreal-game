import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';
import { HouseFurnishing } from './house-furnishing.entity';
import { HousingPlot } from './housing-plot.entity';

@Entity('houses')
export class House {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @OneToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_character_id' })
  owner: GameCharacter;

  @Index({ unique: true })
  @OneToOne(() => HousingPlot, (plot) => plot.house, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plot_id' })
  plot: HousingPlot;

  @Column({ length: 80 })
  name: string;

  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => HouseFurnishing, (furnishing) => furnishing.house)
  furnishings: HouseFurnishing[];
}
