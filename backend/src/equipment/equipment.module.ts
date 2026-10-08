import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';

@Module({ imports: [TypeOrmModule.forFeature([CharacterEquipment]), forwardRef(() => CharactersModule), InventoryModule], controllers: [EquipmentController], providers: [EquipmentService], exports: [EquipmentService] })
export class EquipmentModule {}
