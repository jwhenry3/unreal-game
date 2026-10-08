import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module';
import { CharacterStat } from './entities/character-stat.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({ imports: [TypeOrmModule.forFeature([CharacterStat]), forwardRef(() => CharactersModule)], controllers: [StatsController], providers: [StatsService], exports: [StatsService] })
export class StatsModule {}
