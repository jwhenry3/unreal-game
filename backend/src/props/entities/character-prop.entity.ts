import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

@Entity('character_props')
export class CharacterProp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @OneToOne(() => InventoryItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem | null;

  @Column({ name: 'prop_key', length: 64 })
  propKey: string;

  @Column({ type: 'simple-json' })
  transform: Record<string, unknown>;

  @Column({ name: 'is_mounted', type: 'boolean', default: true })
  isMounted: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
