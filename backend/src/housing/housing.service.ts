import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { GameCharacter } from '../characters/entities/game-character.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { CreateHousingPlotDto } from './dto/create-housing-plot.dto';
import { PlaceFurnishingDto } from './dto/place-furnishing.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { House } from './entities/house.entity';
import { HouseFurnishing } from './entities/house-furnishing.entity';
import { HousingPlot } from './entities/housing-plot.entity';

@Injectable()
export class HousingService {
  constructor(
    @InjectRepository(HousingPlot)
    private readonly plots: Repository<HousingPlot>,
    @InjectRepository(House)
    private readonly houses: Repository<House>,
    @InjectRepository(HouseFurnishing)
    private readonly furnishings: Repository<HouseFurnishing>,
    private readonly characters: CharactersService,
  ) {}

  async listPlots(realm?: string): Promise<Array<HousingPlot & { house: House | null }>> {
    const plots = await this.plots.find({
      where: realm ? { realm } : {},
      order: { realm: 'ASC', district: 'ASC', plotKey: 'ASC' },
      take: 500,
    });
    if (plots.length === 0) {
      return [];
    }

    const houses = await this.houses.find({
      where: { plot: { id: In(plots.map((plot) => plot.id)) } },
      relations: { owner: true, plot: true },
    });
    const housesByPlot = new Map(houses.map((house) => [house.plot.id, house]));

    return plots.map((plot) => ({
      ...plot,
      house: this.publicHouse(housesByPlot.get(plot.id) ?? null),
    }));
  }

  async listPublicHouses(realm?: string): Promise<House[]> {
    const houses = await this.houses.find({
      where: {
        isPublic: true,
        ...(realm ? { plot: { realm } } : {}),
      },
      relations: { owner: true, plot: true },
      take: 200,
    });
    return houses.map((house) => this.publicHouse(house) as House);
  }

  async createPlot(dto: CreateHousingPlotDto): Promise<HousingPlot> {
    const plot = this.plots.create({
      realm: dto.realm,
      district: dto.district,
      plotKey: dto.plotKey,
      sizeTier: dto.sizeTier ?? 'standard',
    });

    try {
      return await this.plots.save(plot);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('A housing plot with that key already exists.');
      }
      throw error;
    }
  }

  async claimPlot(
    characterId: string,
    plotId: string,
    user: AuthenticatedUser,
  ): Promise<House> {
    const character = await this.characters.getOwned(characterId, user.id);

    return this.houses.manager.transaction(async (manager) => {
      const plot = await manager.findOne(HousingPlot, { where: { id: plotId } });
      if (!plot) {
        throw new NotFoundException('Housing plot was not found.');
      }
      if (plot.realm.toLowerCase() !== character.realm.toLowerCase()) {
        throw new BadRequestException('Characters can only claim plots on their realm.');
      }

      const existingPlotHouse = await manager.findOne(House, {
        where: { plot: { id: plot.id } },
      });
      if (existingPlotHouse) {
        throw new ConflictException('That housing plot is already claimed.');
      }

      const existingCharacterHouse = await manager.findOne(House, {
        where: { owner: { id: character.id } },
      });
      if (existingCharacterHouse) {
        throw new ConflictException('That character already owns a house.');
      }

      return manager.save(
        manager.create(House, {
          owner: character,
          plot,
          name: `${character.name}'s House`,
          isPublic: true,
          metadata: null,
        }),
      );
    });
  }

  async getHouse(characterId: string, user: AuthenticatedUser): Promise<House> {
    await this.characters.getOwned(characterId, user.id);
    const house = await this.houses.findOne({
      where: { owner: { id: characterId } },
      relations: { owner: true, plot: true, furnishings: true },
    });

    if (!house) {
      throw new NotFoundException('Character does not own a house.');
    }

    return house;
  }

  async updateHouse(
    characterId: string,
    user: AuthenticatedUser,
    dto: UpdateHouseDto,
  ): Promise<House> {
    const house = await this.getHouse(characterId, user);
    if (dto.name !== undefined) house.name = dto.name;
    if (dto.isPublic !== undefined) house.isPublic = dto.isPublic;
    if (dto.metadata !== undefined) house.metadata = dto.metadata;
    return this.houses.save(house);
  }

  async placeFurnishing(
    characterId: string,
    user: AuthenticatedUser,
    dto: PlaceFurnishingDto,
  ): Promise<HouseFurnishing> {
    const house = await this.getHouse(characterId, user);
    return this.furnishings.manager.transaction(async (manager) => {
      const item = await manager.findOne(InventoryItem, {
        where: {
          id: dto.inventoryItemId,
          character: { id: characterId },
        },
        relations: { character: true },
      });
      if (!item) {
        throw new NotFoundException('Inventory item was not found.');
      }
      if (item.container !== 'inventory') {
        throw new ConflictException('Only inventory items can be placed as furnishings.');
      }

      item.container = 'housing';
      item.slotIndex = null;
      await manager.getRepository(InventoryItem).save(item);
      return manager.save(
        manager.create(HouseFurnishing, {
          house,
          itemKey: item.itemKey,
          inventoryItem: item,
          transform: dto.transform,
          metadata: dto.metadata ?? null,
        }),
      );
    });
  }

  async removeFurnishing(
    characterId: string,
    furnishingId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    const house = await this.getHouse(characterId, user);
    await this.furnishings.manager.transaction(async (manager) => {
      const furnishing = await manager.findOne(HouseFurnishing, {
        where: { id: furnishingId, house: { id: house.id } },
        relations: { house: true, inventoryItem: { character: true } },
      });
      if (!furnishing) {
        throw new NotFoundException('Furnishing was not found.');
      }

      if (furnishing.inventoryItem) {
        furnishing.inventoryItem.character = house.owner;
        furnishing.inventoryItem.container = 'inventory';
        furnishing.inventoryItem.slotIndex = null;
        await manager.getRepository(InventoryItem).save(furnishing.inventoryItem);
      }
      await manager.getRepository(HouseFurnishing).remove(furnishing);
    });
    return { success: true };
  }

  async releaseHouse(
    characterId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    const house = await this.getHouse(characterId, user);
    await this.houses.manager.transaction(async (manager) => {
      const transactionalHouse = await manager.findOne(House, {
        where: { id: house.id },
        relations: {
          owner: true,
          plot: true,
          furnishings: { inventoryItem: true },
        },
      });
      if (!transactionalHouse) {
        throw new NotFoundException('Character does not own a house.');
      }

      for (const furnishing of transactionalHouse.furnishings) {
        if (!furnishing.inventoryItem) {
          continue;
        }
        furnishing.inventoryItem.character = transactionalHouse.owner;
        furnishing.inventoryItem.container = 'inventory';
        furnishing.inventoryItem.slotIndex = null;
        await manager.getRepository(InventoryItem).save(furnishing.inventoryItem);
      }
      await manager.getRepository(House).remove(transactionalHouse);
    });
    return { success: true };
  }

  private publicHouse(house: House | null): House | null {
    if (!house) {
      return null;
    }

    return {
      ...house,
      owner: {
        id: house.owner.id,
        name: house.owner.name,
        realm: house.owner.realm,
        mainJob: house.owner.mainJob,
        subJob: house.owner.subJob,
        jobProgress: house.owner.jobProgress?.map((progress) => ({
          id: progress.id,
          jobKey: progress.jobKey,
          level: progress.level,
          experience: progress.experience,
          isUnlocked: progress.isUnlocked,
        })) ?? [],
      } as GameCharacter,
    };
  }
}
