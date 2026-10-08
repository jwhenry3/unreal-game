import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainEvent } from './entities/domain-event.entity';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([DomainEvent])],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
