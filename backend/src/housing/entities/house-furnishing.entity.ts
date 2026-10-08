import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { House } from './house.entity';

@Entity('house_furnishings')
export class HouseFurnishing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => House, (house) => house.furnishings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'house_id' })
  house: House;

  @Column({ name: 'item_key', length: 128 })
  itemKey: string;

  @Index({ unique: true })
  @OneToOne(() => InventoryItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem | null;

  @Column({ type: 'simple-json' })
  transform: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
