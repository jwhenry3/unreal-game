import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GameCharacter } from '../../characters/entities/game-character.entity';
import { MailAttachment } from './mail-attachment.entity';

@Entity('mail_messages')
export class MailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => GameCharacter, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_character_id' })
  sender: GameCharacter | null;

  @Index()
  @ManyToOne(() => GameCharacter, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_character_id' })
  recipient: GameCharacter;

  @Column({ length: 160 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'claimed_at', type: 'datetime', nullable: true })
  claimedAt: Date | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => MailAttachment, (attachment) => attachment.mail, {
    cascade: true,
  })
  attachments: MailAttachment[];
}
