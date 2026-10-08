import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { InventoryModule } from '../inventory/inventory.module';
import { House } from './entities/house.entity';
import { HouseFurnishing } from './entities/house-furnishing.entity';
import { HousingPlot } from './entities/housing-plot.entity';
import { HousingController } from './housing.controller';
import { HousingService } from './housing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HousingPlot, House, HouseFurnishing]),
    CharactersModule,
    InventoryModule,
  ],
  controllers: [HousingController],
  providers: [HousingService],
  exports: [HousingService],
})
export class HousingModule {}
