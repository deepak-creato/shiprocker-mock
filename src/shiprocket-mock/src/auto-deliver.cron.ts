import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { MockSrShipment } from './entities/mock-sr-shipment.entity';
import { MockShiprocketService } from './mock-shiprocket.service';

const DEFAULT_AFTER_MIN = 1;
const MS_PER_MIN = 60 * 1000;

const FORWARD_HAPPY_PATH = [
  'PICKED UP',
  'IN TRANSIT',
  'OUT FOR DELIVERY',
  'DELIVERED',
] as const;

const REVERSE_HAPPY_PATH = [
  'RETURN PICKED UP',
  'RETURN IN TRANSIT',
  'RETURN DELIVERED',
] as const;

const SKIP_STATUSES = [
  'DELIVERED',
  'RETURN DELIVERED',
  'CANCELLED',
  'FAILED DELIVERY',
  'RTO INITIATED',
  'RTO DELIVERED',
  'RETURNED',
  'QC FAILED',
] as const;

/**
 * Next happy-path scan, or null when already terminal on that path.
 * NEW / AWB ASSIGNED / PICKUP REQUESTED start at the first scan.
 * @param {Pick<MockSrShipment, 'status' | 'isReturn'>} row - Mock shipment
 * @returns {string | null} Status to post, or null to skip
 */
export function nextHappyStatus(
  row: Pick<MockSrShipment, 'status' | 'isReturn'>,
): string | null {
  const path = row.isReturn ? REVERSE_HAPPY_PATH : FORWARD_HAPPY_PATH;
  const idx = (path as readonly string[]).indexOf(row.status);
  if (idx === -1) {
    return path[0];
  }
  if (idx >= path.length - 1) {
    return null;
  }
  return path[idx + 1];
}

/**
 * Walks aged mock shipments one happy-path scan per minute.
 * Reuses advanceStatus so Creato webhook path stays one.
 */
@Injectable()
export class AutoDeliverCron {
  private readonly logger = new Logger(AutoDeliverCron.name);
  private isRunning = false;

  /**
   * @param {Repository<MockSrShipment>} shipments - Mock shipment rows
   * @param {MockShiprocketService} mock - Status + webhook
   * @param {ConfigService} config - Enable flag and first-scan delay
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
      const afterMin =
        this.config.get<number>(
          'app.shiprocket_mock_auto_event_after_min',
          DEFAULT_AFTER_MIN,
        ) ?? DEFAULT_AFTER_MIN;
      const cutoff = new Date(Date.now() - afterMin * MS_PER_MIN);
      const rows = await this.shipments.find({
        where: {
          createdAt: LessThanOrEqual(cutoff),
          status: Not(In([...SKIP_STATUSES])),
        },
      });
      let advanced = 0;
      for (const row of rows) {
        const next = nextHappyStatus(row);
        if (!next) {
          continue;
        }
        try {
          await this.mock.advanceStatus({
            shipment_id: row.id,
            current_status: next,
          });
          advanced += 1;
        } catch (error) {
          this.logger.error(
            `Auto-advance failed for shipment ${row.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
      if (advanced > 0) {
        this.logger.log(`Auto-advanced ${advanced} mock shipment(s)`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
