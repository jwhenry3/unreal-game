import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CharacterProp } from './entities/character-prop.entity';
import { PropsController } from './props.controller';
import { PropsService } from './props.service';

@Module({ imports: [TypeOrmModule.forFeature([CharacterProp]), forwardRef(() => CharactersModule), InventoryModule], controllers: [PropsController], providers: [PropsService], exports: [PropsService] })
export class PropsModule {}
