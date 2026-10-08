import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { ObservabilityClient } from '../observability/observability-client.service';
import { DomainEvent } from './entities/domain-event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(DomainEvent)
    private readonly events: Repository<DomainEvent>,
    private readonly observability: ObservabilityClient,
  ) {}

  async record(
    type: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    manager?: EntityManager,
    idempotencyKey?: string,
  ): Promise<DomainEvent> {
    const repository = manager?.getRepository(DomainEvent) ?? this.events;
    if (idempotencyKey) {
      const existing = await repository.findOne({ where: { idempotencyKey } });
      if (existing) {
        return existing;
      }
    }

    const event = repository.create({
      type,
      aggregateType,
      aggregateId,
      payload,
      idempotencyKey: idempotencyKey ?? null,
      processedAt: null,
    });

    try {
      const saved = await repository.save(event);
      this.observability.emit({
        kind: 'domain',
        name: saved.type,
        message: `${saved.aggregateType}:${saved.aggregateId}`,
        attributes: {
          eventId: saved.id,
          aggregateType: saved.aggregateType,
          aggregateId: saved.aggregateId,
          payload: saved.payload,
        },
      });
      return saved;
    } catch (error) {
      if (error instanceof QueryFailedError && idempotencyKey) {
        const existing = await repository.findOne({ where: { idempotencyKey } });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async list(unprocessedOnly = true): Promise<DomainEvent[]> {
    return this.events.find({
      where: unprocessedOnly ? { processedAt: IsNull() } : {},
      order: { createdAt: 'ASC' },
      take: 500,
    });
  }

  async markProcessed(eventId: string): Promise<DomainEvent> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Domain event was not found.');
    }

    event.processedAt = new Date();
    return this.events.save(event);
  }
}
