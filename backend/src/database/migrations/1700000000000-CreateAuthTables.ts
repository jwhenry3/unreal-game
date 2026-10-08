import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1700000000000 implements MigrationInterface {
  name = 'CreateAuthTables1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "username" varchar(64) NOT NULL,
        "email" varchar(255),
        "password_hash" varchar NOT NULL,
        "display_name" varchar(64) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        "last_login_at" datetime
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username" ON "users" ("username")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "token_hash" varchar(128) NOT NULL,
        "user_id" varchar NOT NULL,
        "expires_at" datetime NOT NULL,
        "remember_me" boolean NOT NULL DEFAULT (0),
        "revoked_at" datetime,
        "last_used_at" datetime,
        "ip_address" varchar(64),
        "user_agent" varchar(512),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_auth_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_auth_sessions_token_hash" ON "auth_sessions" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_auth_sessions_user_id" ON "auth_sessions" ("user_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_auth_sessions_user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_auth_sessions_token_hash"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth_sessions"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_email"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_username"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
