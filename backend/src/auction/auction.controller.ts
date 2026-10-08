import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuctionService } from './auction.service';
import { CreateAuctionListingDto } from './dto/create-auction-listing.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { AuctionListing } from './entities/auction-listing.entity';

@Controller()
export class AuctionController {
  constructor(private readonly auctions: AuctionService) {}

  @Get('auction/listings')
  list(
    @Query('realm') realm?: string,
    @Query('itemKey') itemKey?: string,
  ): Promise<AuctionListing[]> {
    return this.auctions.list(realm, itemKey);
  }

  @Get('auction/listings/:listingId')
  get(
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<AuctionListing> {
    return this.auctions.get(listingId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('characters/:characterId/auction/listings')
  listForCharacter(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuctionListing[]> {
    return this.auctions.listForCharacter(characterId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/auction/listings')
  create(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: CreateAuctionListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    return this.auctions.create(characterId, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/auction/listings/:listingId/bid')
  bid(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() dto: PlaceBidDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    return this.auctions.placeBid(characterId, listingId, dto.amount, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/auction/listings/:listingId/buyout')
  buyout(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    return this.auctions.buyout(characterId, listingId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/auction/listings/:listingId/cancel')
  cancel(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuctionListing> {
    return this.auctions.cancel(characterId, listingId, user);
  }
}
