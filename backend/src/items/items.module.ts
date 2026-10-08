import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemDefinition } from './entities/item-definition.entity';
import { ItemDefinitionsController } from './items.controller';
import { ItemDefinitionsService } from './items.service';

@Module({ imports: [TypeOrmModule.forFeature([ItemDefinition])], controllers: [ItemDefinitionsController], providers: [ItemDefinitionsService], exports: [ItemDefinitionsService] })
export class ItemDefinitionsModule {}
