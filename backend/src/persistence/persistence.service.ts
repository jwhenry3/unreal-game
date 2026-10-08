import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BatchStateDto } from './dto/batch-state.dto';
import { PutStateDto } from './dto/put-state.dto';
import { PersistedState } from './entities/persisted-state.entity';

@Injectable()
export class PersistenceService {
  constructor(
    @InjectRepository(PersistedState)
    private readonly states: Repository<PersistedState>,
  ) {}

  list(scope: string, scopeId: string): Promise<PersistedState[]> {
    this.validateCoordinates(scope, scopeId, 'state');
    return this.states.find({
      where: { scope, scopeId },
      order: { stateKey: 'ASC' },
      take: 1000,
    });
  }

  async get(
    scope: string,
    scopeId: string,
    key: string,
  ): Promise<PersistedState> {
    this.validateCoordinates(scope, scopeId, key);
    const state = await this.states.findOne({
      where: { scope, scopeId, stateKey: key },
    });

    if (!state) {
      throw new NotFoundException('Persisted state was not found.');
    }

    return state;
  }

  async put(
    scope: string,
    scopeId: string,
    key: string,
    dto: PutStateDto,
  ): Promise<PersistedState> {
    return this.states.manager.transaction(async (manager) => {
      return this.upsert(manager, scope, scopeId, key, dto.value, dto.expectedVersion);
    });
  }

  async batch(
    scope: string,
    scopeId: string,
    dto: BatchStateDto,
  ): Promise<PersistedState[]> {
    return this.states.manager.transaction(async (manager) => {
      const results: PersistedState[] = [];
      for (const entry of dto.entries) {
        results.push(
          await this.upsert(
            manager,
            scope,
            scopeId,
            entry.key,
            entry.value,
            entry.expectedVersion,
          ),
        );
      }
      return results;
    });
  }

  async remove(
    scope: string,
    scopeId: string,
    key: string,
  ): Promise<{ success: true }> {
    const state = await this.get(scope, scopeId, key);
    await this.states.remove(state);
    return { success: true };
  }

  private async upsert(
    manager: EntityManager,
    scope: string,
    scopeId: string,
    key: string,
    value: unknown,
    expectedVersion?: number,
  ): Promise<PersistedState> {
    this.validateCoordinates(scope, scopeId, key);
    const repository = manager.getRepository(PersistedState);
    const existing = await repository.findOne({
      where: { scope, scopeId, stateKey: key },
    });

    if (existing) {
      if (
        expectedVersion !== undefined &&
        existing.version !== expectedVersion
      ) {
        throw new ConflictException(
          `State version conflict. Expected ${expectedVersion}, found ${existing.version}.`,
        );
      }

      existing.stateValue = value;
      existing.version += 1;
      return repository.save(existing);
    }

    if (expectedVersion !== undefined && expectedVersion !== 0) {
      throw new ConflictException(
        `State version conflict. Expected ${expectedVersion}, found 0.`,
      );
    }

    return repository.save(
      repository.create({
        scope,
        scopeId,
        stateKey: key,
        stateValue: value,
        version: 1,
      }),
    );
  }

  private validateCoordinates(scope: string, scopeId: string, key: string): void {
    if (
      !scope ||
      scope.length > 32 ||
      !scopeId ||
      scopeId.length > 128 ||
      !key ||
      key.length > 128
    ) {
      throw new BadRequestException('Invalid persistence scope, scopeId, or key.');
    }
  }
}
