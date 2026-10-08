import { Module } from '@nestjs/common';
import { AbilityDefinitionsModule } from '../abilities/abilities.module';
import { AuctionModule } from '../auction/auction.module';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { EventsModule } from '../events/events.module';
import { HousingModule } from '../housing/housing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemDefinitionsModule } from '../items/items.module';
import { MailModule } from '../mail/mail.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { PropsModule } from '../props/props.module';
import { StatsModule } from '../stats/stats.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [
    AuthModule,
    CharactersModule,
    InventoryModule,
    ItemDefinitionsModule,
    AbilityDefinitionsModule,
    StatsModule,
    EquipmentModule,
    PropsModule,
    MailModule,
    HousingModule,
    AuctionModule,
    PersistenceModule,
    EventsModule,
  ],
  controllers: [InternalController],
})
export class InternalModule {}
