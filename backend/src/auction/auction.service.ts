import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { GameCharacter } from '../characters/entities/game-character.entity';
import { EventsService } from '../events/events.service';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { CreateAuctionListingDto } from './dto/create-auction-listing.dto';
import { AuctionListing } from './entities/auction-listing.entity';

@Injectable()
export class AuctionService {
  constructor(
    @InjectRepository(AuctionListing)
    private readonly listings: Repository<AuctionListing>,
    private readonly characters: CharactersService,
    private readonly events: EventsService,
  ) {}

  async list(realm?: string, itemKey?: string): Promise<AuctionListing[]> {
    const query = this.listings
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.seller', 'seller')
      .leftJoinAndSelect('listing.currentBidder', 'currentBidder')
      .leftJoinAndSelect('listing.item', 'item')
      .where('listing.status = :status', { status: 'active' })
      .andWhere('listing.expiresAt > :now', { now: new Date() })
      .orderBy('listing.expiresAt', 'ASC')
      .take(200);

    if (realm) {
      query.andWhere('LOWER(listing.realm) = :realm', {
        realm: realm.toLowerCase(),
      });
    }
    if (itemKey) {
      query.andWhere('LOWER(listing.itemKey) LIKE :itemKey', {
        itemKey: `%${itemKey.toLowerCase()}%`,
      });
    }

    const listings = await query.getMany();
    return listings.map((listing) => this.publicListing(listing));
  }

  async get(listingId: string): Promise<AuctionListing> {
    const listing = await this.listings.findOne({
      where: { id: listingId },
      relations: { seller: true, currentBidder: true, item: { character: true } },
    });
    if (!listing) {
      throw new NotFoundException('Auction listing was not found.');
    }
    return this.publicListing(listing);
  }

  async listForCharacter(
    characterId: string,
    user: AuthenticatedUser,
  ): Promise<AuctionListing[]> {
    await this.characters.getOwned(characterId, user.id);
    const listings = await this.listings.find({
      where: { seller: { id: characterId } },
      relations: { item: { character: true }, currentBidder: true, seller: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return listings.map((listing) => this.publicListing(listing));
  }

  async create(
    characterId: string,
    user: AuthenticatedUser,
    dto: CreateAuctionListingDto,
  ): Promise<AuctionListing> {
    if (dto.buyoutPrice !== undefined && dto.buyoutPrice < dto.startingBid) {
      throw new BadRequestException('buyoutPrice must be greater than startingBid.');
    }

    const seller = await this.characters.getOwned(characterId, user.id);
    return this.listings.manager.transaction(async (manager) => {
      const item = await manager.findOne(InventoryItem, {
        where: {
          id: dto.inventoryItemId,
          character: { id: seller.id },
        },
        relations: { character: true },
      });
      if (!item) {
        throw new NotFoundException('Inventory item was not found.');
      }
      if (item.container !== 'inventory' || item.isBound) {
        throw new ConflictException('Only unbound inventory items can be auctioned.');
      }

      item.container = 'auction';
      item.slotIndex = null;
      await manager.getRepository(InventoryItem).save(item);

      const listing = await manager.save(
        manager.create(AuctionListing, {
          seller,
          item,
          itemKey: item.itemKey,
          quantity: item.quantity,
          itemMetadata: item.metadata,
          realm: seller.realm,
          startingBid: dto.startingBid,
          buyoutPrice: dto.buyoutPrice ?? null,
          currentBid: null,
          currentBidder: null,
          status: 'active',
          expiresAt: new Date(Date.now() + dto.durationHours * 3_600_000),
          closedAt: null,
        }),
      );

      await this.events.record(
        'auction.listing.created',
        'auction_listing',
        listing.id,
        { sellerCharacterId: seller.id, itemKey: item.itemKey },
        manager,
      );
      return this.publicListing(listing);
    });
  }

  async placeBid(
    characterId: string,
    listingId: string,
    amount: number,
    user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    const bidder = await this.characters.getOwned(characterId, user.id);
    return this.listings.manager.transaction(async (manager) => {
      const listing = await this.getActiveListing(manager, listingId);
      if (listing.seller.id === bidder.id) {
        throw new BadRequestException('Sellers cannot bid on their own listing.');
      }

      if (
        listing.buyoutPrice !== null &&
        amount >= listing.buyoutPrice
      ) {
        return this.completeSale(manager, listing, bidder, listing.buyoutPrice);
      }

      if (listing.currentBidder?.id === bidder.id) {
        throw new BadRequestException('You already hold the highest bid.');
      }

      const minimumBid = listing.currentBid === null
        ? listing.startingBid
        : listing.currentBid + 1;
      if (amount < minimumBid) {
        throw new ConflictException(`Bid must be at least ${minimumBid}.`);
      }

      const transactionalBidder = await this.getCharacter(manager, bidder.id);
      if (transactionalBidder.currency < amount) {
        throw new ConflictException('Insufficient currency for that bid.');
      }

      if (listing.currentBidder && listing.currentBid !== null) {
        const previousBidder = await this.getCharacter(
          manager,
          listing.currentBidder.id,
        );
        previousBidder.currency += listing.currentBid;
        await manager.getRepository(GameCharacter).save(previousBidder);
      }

      transactionalBidder.currency -= amount;
      await manager.getRepository(GameCharacter).save(transactionalBidder);

      listing.currentBid = amount;
      listing.currentBidder = transactionalBidder;
      const saved = await manager.getRepository(AuctionListing).save(listing);
      await this.events.record(
        'auction.bid.placed',
        'auction_listing',
        listing.id,
        { bidderCharacterId: bidder.id, amount },
        manager,
      );
      return this.publicListing(saved);
    });
  }

  async buyout(
    characterId: string,
    listingId: string,
    user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    const buyer = await this.characters.getOwned(characterId, user.id);
    return this.listings.manager.transaction(async (manager) => {
      const listing = await this.getActiveListing(manager, listingId);
      if (listing.seller.id === buyer.id) {
        throw new BadRequestException('Sellers cannot buy their own listing.');
      }
      if (listing.buyoutPrice === null) {
        throw new BadRequestException('That listing does not have a buyout price.');
      }

      return this.completeSale(manager, listing, buyer, listing.buyoutPrice);
    });
  }

  async cancel(
    characterId: string,
    listingId: string,
    user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    const seller = await this.characters.getOwned(characterId, user.id);
    return this.listings.manager.transaction(async (manager) => {
      const listing = await this.getActiveListing(manager, listingId);
      if (listing.seller.id !== seller.id) {
        throw new BadRequestException('Only the seller can cancel that listing.');
      }

      await this.refundCurrentBid(manager, listing);
      await this.returnItemToSeller(manager, listing);
      listing.status = 'cancelled';
      listing.closedAt = new Date();
      const saved = await manager.getRepository(AuctionListing).save(listing);
      await this.events.record(
        'auction.listing.cancelled',
        'auction_listing',
        listing.id,
        { sellerCharacterId: seller.id },
        manager,
      );
      return this.publicListing(saved);
    });
  }

  async processExpired(): Promise<{ processed: number }> {
    const expiredListings = await this.listings.find({
      where: { status: 'active' },
      relations: { seller: true, currentBidder: true, item: true },
      take: 500,
    });
    let processed = 0;

    for (const candidate of expiredListings) {
      if (candidate.expiresAt.getTime() > Date.now()) {
        continue;
      }

      await this.listings.manager.transaction(async (manager) => {
        const listing = await this.getActiveListing(manager, candidate.id, true);
        if (listing.currentBidder && listing.currentBid !== null) {
          await this.completeSale(
            manager,
            listing,
            listing.currentBidder,
            listing.currentBid,
          );
        } else {
          await this.returnItemToSeller(manager, listing);
          listing.status = 'expired';
          listing.closedAt = new Date();
          await manager.getRepository(AuctionListing).save(listing);
          await this.events.record(
            'auction.listing.expired',
            'auction_listing',
            listing.id,
            { sellerCharacterId: listing.seller.id },
            manager,
          );
        }
      });
      processed += 1;
    }

    return { processed };
  }

  private async getActiveListing(
    manager: EntityManager,
    listingId: string,
    allowExpired = false,
  ): Promise<AuctionListing> {
    const listing = await manager.findOne(AuctionListing, {
      where: { id: listingId },
      relations: { seller: true, currentBidder: true, item: true },
    });

    if (!listing) {
      throw new NotFoundException('Auction listing was not found.');
    }
    if (listing.status !== 'active') {
      throw new ConflictException('Auction listing is no longer active.');
    }
    if (!allowExpired && listing.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Auction listing has expired.');
    }

    return listing;
  }

  private async completeSale(
    manager: EntityManager,
    listing: AuctionListing,
    buyer: GameCharacter,
    salePrice: number,
  ): Promise<AuctionListing> {
    const transactionalBuyer = await this.getCharacter(manager, buyer.id);
    const buyerIsCurrentBidder =
      listing.currentBidder?.id === buyer.id && listing.currentBid !== null;
    const amountDue = buyerIsCurrentBidder
      ? salePrice - listing.currentBid!
      : salePrice;
    if (amountDue < 0) {
      throw new ConflictException('Current bid exceeds the buyout price.');
    }
    if (transactionalBuyer.currency < amountDue) {
      throw new ConflictException('Insufficient currency for that purchase.');
    }

    if (!buyerIsCurrentBidder) {
      await this.refundCurrentBid(manager, listing);
    }
    transactionalBuyer.currency -= amountDue;
    const transactionalSeller = await this.getCharacter(manager, listing.seller.id);
    transactionalSeller.currency += salePrice;

    await manager.getRepository(GameCharacter).save([
      transactionalBuyer,
      transactionalSeller,
    ]);

    if (!listing.item) {
      throw new ConflictException('Auction item is no longer available.');
    }
    listing.item.character = transactionalBuyer;
    listing.item.container = 'inventory';
    listing.item.slotIndex = null;
    await manager.getRepository(InventoryItem).save(listing.item);

    listing.status = 'sold';
    listing.currentBid = salePrice;
    listing.currentBidder = transactionalBuyer;
    listing.closedAt = new Date();
    const saved = await manager.getRepository(AuctionListing).save(listing);
    await this.events.record(
      'auction.listing.sold',
      'auction_listing',
      listing.id,
      {
        sellerCharacterId: listing.seller.id,
        buyerCharacterId: buyer.id,
        price: salePrice,
      },
      manager,
    );
    return this.publicListing(saved);
  }

  private async refundCurrentBid(
    manager: EntityManager,
    listing: AuctionListing,
  ): Promise<void> {
    if (!listing.currentBidder || listing.currentBid === null) {
      return;
    }

    const bidder = await this.getCharacter(manager, listing.currentBidder.id);
    bidder.currency += listing.currentBid;
    await manager.getRepository(GameCharacter).save(bidder);
  }

  private async returnItemToSeller(
    manager: EntityManager,
    listing: AuctionListing,
  ): Promise<void> {
    if (!listing.item) {
      return;
    }

    listing.item.character = listing.seller;
    listing.item.container = 'inventory';
    listing.item.slotIndex = null;
    await manager.getRepository(InventoryItem).save(listing.item);
  }

  private publicListing(listing: AuctionListing): AuctionListing {
    const item = listing.item ? ({ ...listing.item } as Partial<InventoryItem>) : null;
    if (item) {
      delete item.character;
    }

    return {
      ...listing,
      seller: this.publicCharacter(listing.seller),
      currentBidder: listing.currentBidder
        ? this.publicCharacter(listing.currentBidder)
        : null,
      item: item as InventoryItem | null,
    };
  }

  private publicCharacter(character: GameCharacter): GameCharacter {
    return {
      id: character.id,
      name: character.name,
      realm: character.realm,
      mainJob: character.mainJob,
      subJob: character.subJob,
      jobProgress: character.jobProgress?.map((progress) => ({
        id: progress.id,
        jobKey: progress.jobKey,
        level: progress.level,
        experience: progress.experience,
        isUnlocked: progress.isUnlocked,
      })) ?? [],
    } as GameCharacter;
  }

  private async getCharacter(
    manager: EntityManager,
    characterId: string,
  ): Promise<GameCharacter> {
    const character = await manager.findOne(GameCharacter, {
      where: { id: characterId, isDeleted: false },
    });
    if (!character) {
      throw new NotFoundException('Character was not found.');
    }
    return character;
  }
}
