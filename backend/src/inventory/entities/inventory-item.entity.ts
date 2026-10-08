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
import { GameCharacter } from '../../characters/entities/game-character.entity';

@Entity('inventory_items')
@Index(['character', 'container', 'slotIndex'], { unique: true })
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @Column({ length: 32, default: 'inventory' })
  container: string;

  @Column({ name: 'slot_index', type: 'integer', nullable: true })
  slotIndex: number | null;

  @Column({ name: 'item_key', length: 128 })
  itemKey: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'integer', nullable: true })
  durability: number | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'is_bound', type: 'boolean', default: false })
  isBound: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
