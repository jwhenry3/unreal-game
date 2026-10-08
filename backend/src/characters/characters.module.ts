import { forwardRef, Module } from '@nestjs/common';
import { AbilityDefinitionsModule } from '../abilities/abilities.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { PropsModule } from '../props/props.module';
import { StatsModule } from '../stats/stats.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CharacterJobProgress } from './entities/character-job-progress.entity';
import { GameCharacter } from './entities/game-character.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameCharacter, CharacterJobProgress]),
    forwardRef(() => AbilityDefinitionsModule),
    forwardRef(() => StatsModule),
    forwardRef(() => EquipmentModule),
    forwardRef(() => PropsModule),
    PersistenceModule,
  ],
  controllers: [CharactersController],
  providers: [CharactersService],
  exports: [CharactersService],
})
export class CharactersModule {}
