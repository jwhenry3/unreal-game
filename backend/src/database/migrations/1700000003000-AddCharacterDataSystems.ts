import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCharacterDataSystems1700000003000 implements MigrationInterface {
  name = 'AddCharacterDataSystems1700000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "item_definitions" ("item_key" varchar(64) PRIMARY KEY NOT NULL, "name" varchar(128) NOT NULL, "category" varchar(32) NOT NULL, "equip_slot" varchar(32), "max_stack" integer NOT NULL DEFAULT 1, "job_required" varchar(64), "min_level" integer NOT NULL DEFAULT 1, "stats_bonus" text, "use_ability" varchar(64), "metadata" text)`);
    await queryRunner.query(`CREATE TABLE "ability_definitions" ("ability_key" varchar(64) PRIMARY KEY NOT NULL, "name" varchar(128) NOT NULL, "category" varchar(32) NOT NULL, "cast_time_ms" integer NOT NULL DEFAULT 0, "recast_ms" integer NOT NULL DEFAULT 0, "mp_cost" integer NOT NULL DEFAULT 0, "tp_cost" integer NOT NULL DEFAULT 0, "range" real NOT NULL DEFAULT 0, "target_type" varchar(32) NOT NULL, "job_required" varchar(64), "min_job_level" integer NOT NULL DEFAULT 1, "effect_script" varchar(64) NOT NULL, "metadata" text)`);
    await queryRunner.query(`CREATE TABLE "character_stats" ("character_id" varchar NOT NULL, "stat_key" varchar(64) NOT NULL, "base_value" real NOT NULL DEFAULT 0, "bonus_value" real NOT NULL DEFAULT 0, "current_value" real NOT NULL DEFAULT 0, "updated_at" datetime NOT NULL DEFAULT (datetime('now')), PRIMARY KEY ("character_id", "stat_key"), FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "character_equipment" ("character_id" varchar NOT NULL, "slot_key" varchar(64) NOT NULL, "inventory_item_id" varchar, "is_visible" boolean NOT NULL DEFAULT (1), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), PRIMARY KEY ("character_id", "slot_key"), FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE, FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_character_equipment_item" ON "character_equipment" ("inventory_item_id") WHERE "inventory_item_id" IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE "character_abilities" ("character_id" varchar NOT NULL, "ability_key" varchar(64) NOT NULL, "rank" integer NOT NULL DEFAULT 1, "is_unlocked" boolean NOT NULL DEFAULT (1), "source_job" varchar(64), "cooldown_at" datetime, "updated_at" datetime NOT NULL DEFAULT (datetime('now')), PRIMARY KEY ("character_id", "ability_key"), FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE, FOREIGN KEY ("ability_key") REFERENCES "ability_definitions"("ability_key") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "character_props" ("id" varchar PRIMARY KEY NOT NULL, "character_id" varchar NOT NULL, "inventory_item_id" varchar, "prop_key" varchar(64) NOT NULL, "transform" text NOT NULL, "is_mounted" boolean NOT NULL DEFAULT (1), "metadata" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE, FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_character_props_item" ON "character_props" ("inventory_item_id") WHERE "inventory_item_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_character_props_character" ON "character_props" ("character_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "character_props"');
    await queryRunner.query('DROP TABLE IF EXISTS "character_abilities"');
    await queryRunner.query('DROP TABLE IF EXISTS "character_equipment"');
    await queryRunner.query('DROP TABLE IF EXISTS "character_stats"');
    await queryRunner.query('DROP TABLE IF EXISTS "ability_definitions"');
    await queryRunner.query('DROP TABLE IF EXISTS "item_definitions"');
  }
}
