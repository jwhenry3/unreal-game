import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCharacterJobs1700000002000 implements MigrationInterface {
  name = 'AddCharacterJobs1700000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "characters" RENAME COLUMN "class_name" TO "main_job"',
    );
    await queryRunner.query(
      'ALTER TABLE "characters" ADD COLUMN "sub_job" varchar(64)',
    );
    await queryRunner.query(
      'UPDATE "characters" SET "main_job" = LOWER("main_job") WHERE "main_job" IS NOT NULL',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "character_job_progress" (
        "id" varchar PRIMARY KEY NOT NULL,
        "character_id" varchar NOT NULL,
        "job_key" varchar(64) NOT NULL,
        "level" integer NOT NULL DEFAULT 1,
        "experience" integer NOT NULL DEFAULT 0,
        "is_unlocked" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_character_job_progress_character" FOREIGN KEY ("character_id")
          REFERENCES "characters" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_character_job_progress_character" ON "character_job_progress" ("character_id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_character_job_progress_job" ON "character_job_progress" ("character_id", "job_key")',
    );
    await queryRunner.query(`
      INSERT INTO "character_job_progress" (
        "id", "character_id", "job_key", "level", "experience", "is_unlocked"
      )
      SELECT
        'job-' || "id",
        "id",
        "main_job",
        "level",
        "experience",
        1
      FROM "characters"
      WHERE "main_job" IS NOT NULL
    `);
    await queryRunner.query('ALTER TABLE "characters" DROP COLUMN "level"');
    await queryRunner.query('ALTER TABLE "characters" DROP COLUMN "experience"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "characters" ADD COLUMN "level" integer NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE "characters" ADD COLUMN "experience" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query(`
      UPDATE "characters"
      SET
        "level" = (
          SELECT "level" FROM "character_job_progress"
          WHERE "character_id" = "characters"."id"
            AND "job_key" = "characters"."main_job"
        ),
        "experience" = (
          SELECT "experience" FROM "character_job_progress"
          WHERE "character_id" = "characters"."id"
            AND "job_key" = "characters"."main_job"
        )
    `);
    await queryRunner.query(
      'ALTER TABLE "characters" RENAME COLUMN "main_job" TO "class_name"',
    );
    await queryRunner.query('ALTER TABLE "characters" DROP COLUMN "sub_job"');
    await queryRunner.query('DROP TABLE IF EXISTS "character_job_progress"');
  }
}
