import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mock-owned Shiprocket tables. Not part of ecom_* order schema.
 */
export class CreateMockShiprocketTables1799000000001 implements MigrationInterface {
  name = 'CreateMockShiprocketTables1799000000001';

  /**
   * Creates mock_sr_shipments and mock_sr_pickup_locations.
   * @param {QueryRunner} queryRunner - TypeORM query runner
   * @returns {Promise<void>} Resolves when tables exist
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mock_sr_shipments" (
        "id" SERIAL NOT NULL,
        "external_order_id" integer NOT NULL,
        "channel_order_id" character varying(100) NOT NULL,
        "awb" character varying(50),
        "status" character varying(50) NOT NULL,
        "courier_id" integer,
        "is_return" boolean NOT NULL DEFAULT false,
        "pickup_token" character varying(100),
        "label_url" text,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mock_sr_shipments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mock_sr_shipments_awb"
        ON "mock_sr_shipments" ("awb")
    `);
    await queryRunner.query(`
      CREATE TABLE "mock_sr_pickup_locations" (
        "id" SERIAL NOT NULL,
        "name" character varying(200) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mock_sr_pickup_locations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mock_sr_pickup_locations_name" UNIQUE ("name")
      )
    `);
  }

  /**
   * Drops mock Shiprocket tables.
   * @param {QueryRunner} queryRunner - TypeORM query runner
   * @returns {Promise<void>} Resolves when tables are gone
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mock_sr_pickup_locations"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mock_sr_shipments_awb"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mock_sr_shipments"`);
  }
}
