import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

@Entity('character_equipment')
export class CharacterEquipment {
  @PrimaryColumn({ name: 'character_id', type: 'varchar' })
  characterId: string;

  @PrimaryColumn({ name: 'slot_key', length: 64 })
  slotKey: string;

  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: GameCharacter;

  @OneToOne(() => InventoryItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem | null;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
