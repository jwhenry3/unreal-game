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
import { MailMessage } from './mail-message.entity';

export type MailAttachmentType = 'item' | 'currency';

@Entity('mail_attachments')
export class MailAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => MailMessage, (mail) => mail.attachments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mail_message_id' })
  mail: MailMessage;

  @Column({ name: 'attachment_type', length: 16, default: 'item' })
  attachmentType: MailAttachmentType;

  @Column({ name: 'item_key', type: 'varchar', length: 128, nullable: true })
  itemKey: string | null;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'integer', default: 0 })
  currency: number;

  @Index({ unique: true })
  @OneToOne(() => InventoryItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem | null;

  @Column({ type: 'integer', nullable: true })
  durability: number | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'claimed_at', type: 'datetime', nullable: true })
  claimedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
