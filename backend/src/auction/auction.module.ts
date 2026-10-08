import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { EventsModule } from '../events/events.module';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';
import { AuctionListing } from './entities/auction-listing.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuctionListing]),
    CharactersModule,
    EventsModule,
  ],
  controllers: [AuctionController],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class AuctionModule {}
