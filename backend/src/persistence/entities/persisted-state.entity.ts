import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('persisted_states')
@Index(['scope', 'scopeId', 'stateKey'], { unique: true })
export class PersistedState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32 })
  scope: string;

  @Column({ name: 'scope_id', length: 128 })
  scopeId: string;

  @Column({ name: 'state_key', length: 128 })
  stateKey: string;

  @Column({ name: 'state_value', type: 'simple-json' })
  stateValue: unknown;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
