import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { AbilityDefinitionsModule } from './abilities/abilities.module';
import { AuctionModule } from './auction/auction.module';
import { AuthModule } from './auth/auth.module';
import { CharactersModule } from './characters/characters.module';
import { CreateAuthTables1700000000000 } from './database/migrations/1700000000000-CreateAuthTables';
import { CreateMmoDomainTables1700000001000 } from './database/migrations/1700000001000-CreateMmoDomainTables';
import { AddCharacterJobs1700000002000 } from './database/migrations/1700000002000-AddCharacterJobs';
import { AddCharacterDataSystems1700000003000 } from './database/migrations/1700000003000-AddCharacterDataSystems';
import { EquipmentModule } from './equipment/equipment.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { HousingModule } from './housing/housing.module';
import { InternalModule } from './internal/internal.module';
import { ItemDefinitionsModule } from './items/items.module';
import { InventoryModule } from './inventory/inventory.module';
import { MailModule } from './mail/mail.module';
import { ObservabilityModule } from './observability/observability.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PropsModule } from './props/props.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databasePath = resolve(
          process.cwd(),
          config.get<string>('DATABASE_PATH', './data/auth.sqlite'),
        );
        mkdirSync(dirname(databasePath), { recursive: true });

        return {
          type: 'better-sqlite3',
          database: databasePath,
          autoLoadEntities: true,
          synchronize: false,
          migrations: [
            CreateAuthTables1700000000000,
            CreateMmoDomainTables1700000001000,
            AddCharacterJobs1700000002000,
            AddCharacterDataSystems1700000003000,
          ],
          migrationsRun: true,
          logging: config.get<string>('DB_LOGGING') === 'true',
        };
      },
    }),
    AuthModule,
    CharactersModule,
    ItemDefinitionsModule,
    AbilityDefinitionsModule,
    StatsModule,
    EquipmentModule,
    PropsModule,
    InventoryModule,
    MailModule,
    HousingModule,
    AuctionModule,
    PersistenceModule,
    EventsModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
