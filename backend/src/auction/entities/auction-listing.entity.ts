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
import { GameCharacter } from '../../characters/entities/game-character.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

export type AuctionListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

@Entity('auction_listings')
export class AuctionListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_character_id' })
  seller: GameCharacter;

  @Index()
  @OneToOne(() => InventoryItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  item: InventoryItem | null;

  @Column({ name: 'item_key', length: 128 })
  itemKey: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'item_metadata', type: 'simple-json', nullable: true })
  itemMetadata: Record<string, unknown> | null;

  @Column({ length: 64 })
  realm: string;

  @Column({ name: 'starting_bid', type: 'integer' })
  startingBid: number;

  @Column({ name: 'buyout_price', type: 'integer', nullable: true })
  buyoutPrice: number | null;

  @Column({ name: 'current_bid', type: 'integer', nullable: true })
  currentBid: number | null;

  @ManyToOne(() => GameCharacter, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_bidder_character_id' })
  currentBidder: GameCharacter | null;

  @Column({ length: 16, default: 'active' })
  status: AuctionListingStatus;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
