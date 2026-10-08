import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { UpdateCharacterStateDto } from '../internal/dto/update-character-state.dto';
import { CreateCharacterDto } from './dto/create-character.dto';
import { PutJobProgressDto } from './dto/put-job-progress.dto';
import { UpdateCharacterJobsDto } from './dto/update-character-jobs.dto';
import { CharacterJobProgress } from './entities/character-job-progress.entity';
import { GameCharacter } from './entities/game-character.entity';

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(GameCharacter)
    private readonly characters: Repository<GameCharacter>,
    @InjectRepository(CharacterJobProgress)
    private readonly jobProgress: Repository<CharacterJobProgress>,
    private readonly config: ConfigService,
  ) {}

  async listForAccount(accountId: string): Promise<GameCharacter[]> {
    return this.characters.find({
      where: { account: { id: accountId }, isDeleted: false },
      relations: { jobProgress: true },
      order: { name: 'ASC' },
    });
  }

  async create(
    dto: CreateCharacterDto,
    user: AuthenticatedUser,
  ): Promise<GameCharacter> {
    const maxCharacters = this.positiveInteger('MAX_CHARACTERS_PER_ACCOUNT', 8);
    const existingCount = await this.characters.count({
      where: { account: { id: user.id }, isDeleted: false },
    });

    if (existingCount >= maxCharacters) {
      throw new ForbiddenException(
        `This account may create at most ${maxCharacters} characters.`,
      );
    }

    const name = dto.name.trim();
    const realm = dto.realm.trim();
    const existingName = await this.characters
      .createQueryBuilder('character')
      .where('LOWER(character.name) = :name', { name: name.toLowerCase() })
      .andWhere('LOWER(character.realm) = :realm', {
        realm: realm.toLowerCase(),
      })
      .andWhere('character.isDeleted = false')
      .getOne();

    if (existingName) {
      throw new ConflictException('A character with that name already exists on this realm.');
    }

    const mainJob = this.normalizeJobKey(dto.job ?? dto.className ?? 'Adventurer');
    const subJob = dto.subJob ? this.normalizeJobKey(dto.subJob) : null;
    if (subJob === mainJob) {
      throw new BadRequestException('Sub job must be different from the main job.');
    }

    return this.characters.manager.transaction(async (manager) => {
      const character = await manager.save(
        manager.create(GameCharacter, {
          account: { id: user.id } as GameCharacter['account'],
          name,
          realm,
          mainJob,
          subJob,
          currency: 0,
          mapName: null,
          position: null,
          state: null,
          isDeleted: false,
          lastPlayedAt: null,
        }),
      );

      character.jobProgress = await manager.save(
        [mainJob, ...(subJob ? [subJob] : [])].map((jobKey) =>
          manager.create(CharacterJobProgress, {
            character,
            jobKey,
            level: 1,
            experience: 0,
            isUnlocked: true,
          }),
        ),
      );
      return character;
    }).catch((error: unknown) => {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('A character with that name already exists on this realm.');
      }
      throw error;
    });
  }

  async getOwned(
    characterId: string,
    accountId: string,
  ): Promise<GameCharacter> {
    const character = await this.characters.findOne({
      where: {
        id: characterId,
        isDeleted: false,
        account: { id: accountId },
      },
      relations: { jobProgress: true },
    });

    if (!character) {
      throw new NotFoundException('Character was not found.');
    }

    return character;
  }

  async getById(characterId: string): Promise<GameCharacter> {
    const character = await this.characters.findOne({
      where: { id: characterId, isDeleted: false },
      relations: { jobProgress: true },
    });

    if (!character) {
      throw new NotFoundException('Character was not found.');
    }

    return character;
  }

  async findByName(name: string, realm: string): Promise<GameCharacter | null> {
    return this.characters
      .createQueryBuilder('character')
      .leftJoinAndSelect('character.jobProgress', 'jobProgress')
      .where('LOWER(character.name) = :name', { name: name.toLowerCase() })
      .andWhere('LOWER(character.realm) = :realm', { realm: realm.toLowerCase() })
      .andWhere('character.isDeleted = false')
      .getOne();
  }

  async markPlayed(characterId: string, accountId: string): Promise<GameCharacter> {
    const character = await this.getOwned(characterId, accountId);
    character.lastPlayedAt = new Date();
    return this.characters.save(character);
  }

  async softDelete(characterId: string, accountId: string): Promise<{ success: true }> {
    const character = await this.getOwned(characterId, accountId);
    character.isDeleted = true;
    await this.characters.save(character);
    return { success: true };
  }

  async grantCurrency(characterId: string, amount: number): Promise<GameCharacter> {
    const character = await this.getById(characterId);
    const nextCurrency = character.currency + amount;
    if (nextCurrency < 0) {
      throw new ConflictException('Character currency cannot become negative.');
    }

    character.currency = nextCurrency;
    return this.characters.save(character);
  }

  async updateForGameServer(
    characterId: string,
    dto: UpdateCharacterStateDto,
  ): Promise<GameCharacter> {
    const character = await this.getById(characterId);
    if (dto.mapName !== undefined) character.mapName = dto.mapName;
    if (dto.position !== undefined) character.position = dto.position;
    if (dto.state !== undefined) character.state = dto.state;
    return this.characters.save(character);
  }

  async listJobs(characterId: string): Promise<CharacterJobProgress[]> {
    await this.getById(characterId);
    return this.jobProgress.find({
      where: { character: { id: characterId } },
      order: { jobKey: 'ASC' },
    });
  }

  async putJobProgress(
    characterId: string,
    job: string,
    dto: PutJobProgressDto,
  ): Promise<CharacterJobProgress> {
    const character = await this.getById(characterId);
    const jobKey = this.normalizeJobKey(job);
    const progress = await this.jobProgress.findOne({
      where: { character: { id: characterId }, jobKey },
    });

    if (progress) {
      progress.level = dto.level;
      progress.experience = dto.experience;
      if (dto.isUnlocked !== undefined) progress.isUnlocked = dto.isUnlocked;
      return this.jobProgress.save(progress);
    }

    return this.jobProgress.save(
      this.jobProgress.create({
        character,
        jobKey,
        level: dto.level,
        experience: dto.experience,
        isUnlocked: dto.isUnlocked ?? true,
      }),
    );
  }

  async setJobs(
    characterId: string,
    dto: UpdateCharacterJobsDto,
  ): Promise<GameCharacter> {
    if (dto.mainJob === undefined && dto.subJob === undefined) {
      throw new BadRequestException('mainJob or subJob is required.');
    }

    return this.characters.manager.transaction(async (manager) => {
      const character = await manager.findOne(GameCharacter, {
        where: { id: characterId, isDeleted: false },
        relations: { jobProgress: true },
      });
      if (!character) {
        throw new NotFoundException('Character was not found.');
      }

      const mainJob = dto.mainJob === undefined
        ? character.mainJob
        : this.normalizeJobKey(dto.mainJob);
      const subJob = dto.subJob === undefined
        ? character.subJob
        : dto.subJob === null
          ? null
          : this.normalizeJobKey(dto.subJob);

      if (subJob === mainJob) {
        throw new BadRequestException('Sub job must be different from the main job.');
      }

      for (const jobKey of [mainJob, ...(subJob ? [subJob] : [])]) {
        await this.ensureJobProgress(manager, character, jobKey);
      }

      await manager.update(GameCharacter, character.id, {
        mainJob,
        subJob,
      });
      const saved = await manager.findOne(GameCharacter, {
        where: { id: character.id },
        relations: { jobProgress: true },
      });
      if (!saved) {
        throw new NotFoundException('Character was not found.');
      }
      return saved;
    });
  }

  private async ensureJobProgress(
    manager: EntityManager,
    character: GameCharacter,
    jobKey: string,
  ): Promise<CharacterJobProgress> {
    const repository = manager.getRepository(CharacterJobProgress);
    const existing = await repository.findOne({
      where: { character: { id: character.id }, jobKey },
    });
    if (existing) {
      if (!existing.isUnlocked) {
        existing.isUnlocked = true;
        return repository.save(existing);
      }
      return existing;
    }

    return repository.save(
      repository.create({
        character,
        jobKey,
        level: 1,
        experience: 0,
        isUnlocked: true,
      }),
    );
  }

  private normalizeJobKey(job: string): string {
    const normalized = job.trim().toLowerCase();
    if (!normalized || normalized.length > 64 || !/^[a-z0-9 _-]+$/.test(normalized)) {
      throw new BadRequestException('Invalid job key.');
    }
    return normalized;
  }

  private positiveInteger(name: string, fallback: number): number {
    const configured = Number.parseInt(this.config.get<string>(name, ''), 10);
    return Number.isInteger(configured) && configured > 0 ? configured : fallback;
  }
}
