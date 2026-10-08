import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersistedState } from './entities/persisted-state.entity';
import { PersistenceService } from './persistence.service';

@Module({
  imports: [TypeOrmModule.forFeature([PersistedState])],
  providers: [PersistenceService],
  exports: [PersistenceService],
})
export class PersistenceModule {}
