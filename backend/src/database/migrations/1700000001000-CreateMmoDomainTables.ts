import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMmoDomainTables1700000001000 implements MigrationInterface {
  name = 'CreateMmoDomainTables1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "characters" (
        "id" varchar PRIMARY KEY NOT NULL,
        "account_id" varchar NOT NULL,
        "name" varchar(32) NOT NULL,
        "realm" varchar(64) NOT NULL,
        "class_name" varchar(64) NOT NULL DEFAULT 'Adventurer',
        "level" integer NOT NULL DEFAULT 1,
        "experience" integer NOT NULL DEFAULT 0,
        "currency" integer NOT NULL DEFAULT 0,
        "map_name" varchar(128),
        "position" text,
        "state" text,
        "is_deleted" boolean NOT NULL DEFAULT (0),
        "last_played_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_characters_account" FOREIGN KEY ("account_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_characters_account_id" ON "characters" ("account_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_characters_realm_name" ON "characters" ("realm", "name")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_items" (
        "id" varchar PRIMARY KEY NOT NULL,
        "character_id" varchar NOT NULL,
        "container" varchar(32) NOT NULL DEFAULT 'inventory',
        "slot_index" integer,
        "item_key" varchar(128) NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "durability" integer,
        "metadata" text,
        "is_bound" boolean NOT NULL DEFAULT (0),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_inventory_items_character" FOREIGN KEY ("character_id")
          REFERENCES "characters" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_inventory_items_character" ON "inventory_items" ("character_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_inventory_items_slot" ON "inventory_items" ("character_id", "container", "slot_index")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mail_messages" (
        "id" varchar PRIMARY KEY NOT NULL,
        "sender_character_id" varchar,
        "recipient_character_id" varchar NOT NULL,
        "subject" varchar(160) NOT NULL,
        "body" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT (0),
        "claimed_at" datetime,
        "expires_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_mail_messages_sender" FOREIGN KEY ("sender_character_id")
          REFERENCES "characters" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_mail_messages_recipient" FOREIGN KEY ("recipient_character_id")
          REFERENCES "characters" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_mail_messages_sender" ON "mail_messages" ("sender_character_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_mail_messages_recipient" ON "mail_messages" ("recipient_character_id")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mail_attachments" (
        "id" varchar PRIMARY KEY NOT NULL,
        "mail_message_id" varchar NOT NULL,
        "attachment_type" varchar(16) NOT NULL DEFAULT 'item',
        "item_key" varchar(128),
        "quantity" integer NOT NULL DEFAULT 1,
        "currency" integer NOT NULL DEFAULT 0,
        "inventory_item_id" varchar,
        "durability" integer,
        "metadata" text,
        "claimed_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_mail_attachments_message" FOREIGN KEY ("mail_message_id")
          REFERENCES "mail_messages" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mail_attachments_item" FOREIGN KEY ("inventory_item_id")
          REFERENCES "inventory_items" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_mail_attachments_message" ON "mail_attachments" ("mail_message_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mail_attachments_item" ON "mail_attachments" ("inventory_item_id")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "housing_plots" (
        "id" varchar PRIMARY KEY NOT NULL,
        "realm" varchar(64) NOT NULL,
        "district" varchar(64) NOT NULL,
        "plot_key" varchar(64) NOT NULL,
        "size_tier" varchar(32) NOT NULL DEFAULT 'standard',
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_housing_plots_location" ON "housing_plots" ("realm", "district", "plot_key")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "houses" (
        "id" varchar PRIMARY KEY NOT NULL,
        "owner_character_id" varchar NOT NULL,
        "plot_id" varchar NOT NULL,
        "name" varchar(80) NOT NULL,
        "is_public" boolean NOT NULL DEFAULT (1),
        "metadata" text,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_houses_owner" FOREIGN KEY ("owner_character_id")
          REFERENCES "characters" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_houses_plot" FOREIGN KEY ("plot_id")
          REFERENCES "housing_plots" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_houses_owner" ON "houses" ("owner_character_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_houses_plot" ON "houses" ("plot_id")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "house_furnishings" (
        "id" varchar PRIMARY KEY NOT NULL,
        "house_id" varchar NOT NULL,
        "item_key" varchar(128) NOT NULL,
        "inventory_item_id" varchar,
        "transform" text NOT NULL,
        "metadata" text,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_house_furnishings_house" FOREIGN KEY ("house_id")
          REFERENCES "houses" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_house_furnishings_item" FOREIGN KEY ("inventory_item_id")
          REFERENCES "inventory_items" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_house_furnishings_house" ON "house_furnishings" ("house_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_house_furnishings_item" ON "house_furnishings" ("inventory_item_id")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auction_listings" (
        "id" varchar PRIMARY KEY NOT NULL,
        "seller_character_id" varchar NOT NULL,
        "inventory_item_id" varchar,
        "item_key" varchar(128) NOT NULL,
        "quantity" integer NOT NULL,
        "item_metadata" text,
        "realm" varchar(64) NOT NULL,
        "starting_bid" integer NOT NULL,
        "buyout_price" integer,
        "current_bid" integer,
        "current_bidder_character_id" varchar,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "expires_at" datetime NOT NULL,
        "closed_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_auction_listings_seller" FOREIGN KEY ("seller_character_id")
          REFERENCES "characters" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_auction_listings_item" FOREIGN KEY ("inventory_item_id")
          REFERENCES "inventory_items" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_auction_listings_bidder" FOREIGN KEY ("current_bidder_character_id")
          REFERENCES "characters" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_auction_listings_seller" ON "auction_listings" ("seller_character_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_auction_listings_item" ON "auction_listings" ("inventory_item_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_auction_listings_status" ON "auction_listings" ("status", "expires_at")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "persisted_states" (
        "id" varchar PRIMARY KEY NOT NULL,
        "scope" varchar(32) NOT NULL,
        "scope_id" varchar(128) NOT NULL,
        "state_key" varchar(128) NOT NULL,
        "state_value" text NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_persisted_states_key" ON "persisted_states" ("scope", "scope_id", "state_key")',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "domain_events" (
        "id" varchar PRIMARY KEY NOT NULL,
        "type" varchar(128) NOT NULL,
        "aggregate_type" varchar(64) NOT NULL,
        "aggregate_id" varchar(128) NOT NULL,
        "payload" text NOT NULL,
        "idempotency_key" varchar(128),
        "processed_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_events_type" ON "domain_events" ("type")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_domain_events_idempotency" ON "domain_events" ("idempotency_key")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_domain_events_processed" ON "domain_events" ("processed_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "domain_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "persisted_states"');
    await queryRunner.query('DROP TABLE IF EXISTS "auction_listings"');
    await queryRunner.query('DROP TABLE IF EXISTS "house_furnishings"');
    await queryRunner.query('DROP TABLE IF EXISTS "houses"');
    await queryRunner.query('DROP TABLE IF EXISTS "housing_plots"');
    await queryRunner.query('DROP TABLE IF EXISTS "mail_attachments"');
    await queryRunner.query('DROP TABLE IF EXISTS "mail_messages"');
    await queryRunner.query('DROP TABLE IF EXISTS "inventory_items"');
    await queryRunner.query('DROP TABLE IF EXISTS "characters"');
  }
}
