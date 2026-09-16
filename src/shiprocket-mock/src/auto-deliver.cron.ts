import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { MockSrShipment } from './entities/mock-sr-shipment.entity';
import { MockShiprocketService } from './mock-shiprocket.service';

const AUTO_DELIVER_AFTER_MS = 5 * 60 * 1000;

const TERMINAL_STATUSES = [
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'RTO DELIVERED',
  'RETURN DELIVERED',
] as const;

/**
 * Auto-DELIVERED mock forward shipments 5 minutes after create.
 * Reuses advanceStatus so Creato webhook path stays one.
 */
@Injectable()
export class AutoDeliverCron {
  private readonly logger = new Logger(AutoDeliverCron.name);
  private isRunning = false;

  /**
   * @param {Repository<MockSrShipment>} shipments - Mock shipment rows
   * @param {MockShiprocketService} mock - Status + webhook
   * @param {ConfigService} config - Enable flag
   */
  constructor(
    @InjectRepository(MockSrShipment)
    private readonly shipments: Repository<MockSrShipment>,
    private readonly mock: MockShiprocketService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Minute sweep. Skips when disabled or already running.
   * @returns {Promise<void>}
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async deliverAgedShipments(): Promise<void> {
    const enabled = this.config.get<boolean>(
      'app.shiprocket_mock_auto_deliver',
      true,
    );
    if (enabled === false) {
      return;
    }
    if (this.isRunning) {
      this.logger.log('Auto-deliver cron already running; skipping');
      return;
    }
    this.isRunning = true;
    try {
      const cutoff = new Date(Date.now() - AUTO_DELIVER_AFTER_MS);
      const rows = await this.shipments.find({
        where: {
          isReturn: false,
          createdAt: LessThanOrEqual(cutoff),
          status: Not(In([...TERMINAL_STATUSES])),
        },
      });
      for (const row of rows) {
        try {
          await this.mock.advanceStatus({
            shipment_id: row.id,
            current_status: 'DELIVERED',
          });
        } catch (error) {
          this.logger.error(
            `Auto-deliver failed for shipment ${row.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
      if (rows.length > 0) {
        this.logger.log(`Auto-delivered ${rows.length} mock shipment(s)`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
