import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { House } from './house.entity';

@Entity('housing_plots')
@Index(['realm', 'district', 'plotKey'], { unique: true })
export class HousingPlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  realm: string;

  @Column({ length: 64 })
  district: string;

  @Column({ name: 'plot_key', length: 64 })
  plotKey: string;

  @Column({ name: 'size_tier', length: 32, default: 'standard' })
  sizeTier: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToOne(() => House, (house) => house.plot)
  house: House | null;
}
