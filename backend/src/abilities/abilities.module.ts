import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { AbilityDefinitionsController } from './abilities.controller';
import { AbilityDefinitionsService } from './abilities.service';
import { CharacterAbilitiesService } from './character-abilities.service';
import { AbilityDefinition } from './entities/ability-definition.entity';
import { CharacterAbility } from './entities/character-ability.entity';

@Module({ imports: [TypeOrmModule.forFeature([AbilityDefinition, CharacterAbility]), forwardRef(() => CharactersModule)], controllers: [AbilityDefinitionsController], providers: [AbilityDefinitionsService, CharacterAbilitiesService], exports: [AbilityDefinitionsService, CharacterAbilitiesService] })
export class AbilityDefinitionsModule {}
