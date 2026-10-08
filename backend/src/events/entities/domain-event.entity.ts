import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('domain_events')
export class DomainEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 128 })
  type: string;

  @Column({ name: 'aggregate_type', length: 64 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', length: 128 })
  aggregateId: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Index()
  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
