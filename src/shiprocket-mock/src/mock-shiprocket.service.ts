import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { In, Repository } from 'typeorm';
import type {
  ShiprocketAddPickupRequest,
  ShiprocketAddPickupResponse,
  ShiprocketAssignAWBResponse,
  ShiprocketAuthResponse,
  ShiprocketCancelResponse,
  ShiprocketCreateExchangeOrderResponse,
  ShiprocketCreateOrderResponse,
  ShiprocketLabelResponse,
  ShiprocketManifestResponse,
  ShiprocketNdrResponse,
  ShiprocketPickupResponse,
  ShiprocketServiceabilityResponse,
  ShiprocketTrackingResponse,
} from './shiprocket.types';
import { AdvanceStatusDto } from './dto/advance-status.dto';
import { MockSrPickupLocation } from './entities/mock-sr-pickup-location.entity';
import {
  MockSrShipment,
  MockSrShipmentPayload,
} from './entities/mock-sr-shipment.entity';

const FAKE_COURIER_ID = 1;
const FAKE_COURIER_NAME = 'Local Mock Courier';
const INITIAL_STATUS = 'NEW';

const ALLOWED_STATUSES = new Set([
  'PICKED UP',
  'IN TRANSIT',
  'OUT FOR DELIVERY',
  'DELIVERED',
  'FAILED DELIVERY',
  'RTO INITIATED',
  'RTO DELIVERED',
  'RETURNED',
  'RETURN PICKED UP',
  'RETURN IN TRANSIT',
  'RETURN DELIVERED',
  'QC FAILED',
  'CANCELLED',
]);

export type AdvanceStatusResult = {
  awb: string;
  current_status: string;
  webhook_posted: boolean;
};

/**
 * In-process fake of the Shiprocket REST API used by ShiprocketService.
 */
@Injectable()
export class MockShiprocketService {
  private readonly logger = new Logger(MockShiprocketService.name);

  /**
   * @param {Repository<MockSrShipment>} shipments - Fake shipment rows
   * @param {Repository<MockSrPickupLocation>} pickups - Fake pickup names
   * @param {HttpService} http - Posts Creato tracking webhooks
   * @param {ConfigService} config - Mock public URL and webhook target
   */
  constructor(
    @InjectRepository(MockSrShipment)
    private readonly shipments: Repository<MockSrShipment>,
    @InjectRepository(MockSrPickupLocation)
    private readonly pickups: Repository<MockSrPickupLocation>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Accepts any credentials and returns a fake JWT.
   * @param {string} email - Login email from order-service
   * @returns {ShiprocketAuthResponse} Fake auth payload
   */
  login(email: string): ShiprocketAuthResponse {
    return {
      id: 1,
      token: 'mock-shiprocket-token',
      email: email || 'dev@local',
      first_name: 'Local',
      last_name: 'Mock',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Returns one always-available mock courier.
   * @returns {ShiprocketServiceabilityResponse} Wrapped serviceability data
   */
  checkServiceability(): ShiprocketServiceabilityResponse {
    return {
      status: 200,
      data: {
        available_courier_companies: [
          {
            courier_company_id: FAKE_COURIER_ID,
            courier_name: FAKE_COURIER_NAME,
            freight_charge: 40,
            cod_charges: 0,
            rate: 40,
            estimated_delivery_days: 3,
            is_surface: true,
            cod: 1,
          },
        ],
      },
    };
  }

  /**
   * Creates a forward or reverse shipment row.
   * @param {Record<string, unknown>} body - Shiprocket create payload
   * @param {boolean} isReturn - Reverse pickup when true
   * @returns {Promise<ShiprocketCreateOrderResponse>} Numeric ids
   */
  async createShipment(
    body: Record<string, unknown>,
    isReturn: boolean,
  ): Promise<ShiprocketCreateOrderResponse> {
    const channelOrderId =
      this.readString(body, 'order_id') || `LOCAL-${Date.now()}`;
    const row = await this.insertShipment(channelOrderId, isReturn, body);
    return {
      order_id: row.externalOrderId,
      shipment_id: row.id,
      status: row.status,
      status_code: 1,
    };
  }

  /**
   * Creates forward + return legs for an exchange.
   * @param {Record<string, unknown>} body - Exchange payload
   * @returns {Promise<ShiprocketCreateExchangeOrderResponse>} Both legs
   */
  async createExchange(
    body: Record<string, unknown>,
  ): Promise<ShiprocketCreateExchangeOrderResponse> {
    const forwardChannel =
      this.readString(body, 'exchange_order_id') || `EX-${Date.now()}`;
    const returnChannel =
      this.readString(body, 'return_order_id') || `RET-${Date.now()}`;
    const forward = await this.insertShipment(forwardChannel, false, body);
    const reverse = await this.insertShipment(returnChannel, true, body);
    return {
      success: true,
      data: {
        forward_orders: {
          order_id: forward.externalOrderId,
          channel_order_id: forward.channelOrderId,
          shipment_id: forward.id,
          status: forward.status,
          status_code: 1,
        },
        return_orders: {
          order_id: reverse.externalOrderId,
          channel_order_id: reverse.channelOrderId,
          shipment_id: reverse.id,
          status: reverse.status,
          status_code: 1,
        },
      },
    };
  }

  /**
   * Assigns a LOCAL AWB if missing.
   * @param {number} shipmentId - Mock shipment id
   * @param {number} courierId - Courier company id
   * @returns {Promise<ShiprocketAssignAWBResponse>} AWB assignment
   */
  async assignAwb(
    shipmentId: number,
    courierId: number,
  ): Promise<ShiprocketAssignAWBResponse> {
    const row = await this.requireShipmentById(shipmentId);
    if (!row.awb) {
      row.awb = `LOCAL${row.id}`;
    }
    row.courierId = courierId || FAKE_COURIER_ID;
    row.status = 'AWB ASSIGNED';
    await this.shipments.save(row);
    return {
      awb_assign_status: 1,
      response: {
        data: {
          awb_code: row.awb,
          courier_name: FAKE_COURIER_NAME,
          courier_id: row.courierId,
          assigned_date_time: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * Marks pickup scheduled and issues a fake token.
   * @param {number[]} shipmentIds - Mock shipment ids
   * @returns {Promise<ShiprocketPickupResponse>} Pickup token
   */
  async requestPickup(
    shipmentIds: number[],
  ): Promise<ShiprocketPickupResponse> {
    const id = shipmentIds[0];
    if (!id) {
      throw new NotFoundException('shipment_id required');
    }
    const row = await this.requireShipmentById(id);
    row.pickupToken = row.pickupToken ?? `PK${row.id}`;
    row.status = 'PICKUP REQUESTED';
    await this.shipments.save(row);
    return {
      pickup_status: 1,
      response: {
        pickup_scheduled_date: new Date().toISOString().slice(0, 10),
        pickup_token_number: row.pickupToken,
      },
    };
  }

  /**
   * Stores a mock label URL pointing at this app.
   * @param {number[]} shipmentIds - Mock shipment ids
   * @returns {Promise<ShiprocketLabelResponse>} Label URL
   */
  async generateLabel(shipmentIds: number[]): Promise<ShiprocketLabelResponse> {
    const id = shipmentIds[0];
    if (!id) {
      throw new NotFoundException('shipment_id required');
    }
    const row = await this.requireShipmentById(id);
    const labelUrl = `${this.publicUrl()}/labels/${row.id}`;
    row.labelUrl = labelUrl;
    await this.shipments.save(row);
    return {
      label_created: 1,
      response: { label_url: labelUrl },
      label_url: labelUrl,
    };
  }

  /**
   * Returns a placeholder manifest URL.
   * @param {number[]} shipmentIds - Mock shipment ids
   * @returns {ShiprocketManifestResponse} Manifest URL
   */
  generateManifest(shipmentIds: number[]): ShiprocketManifestResponse {
    const id = shipmentIds[0] ?? 0;
    return {
      manifest_url: `${this.publicUrl()}/labels/${id}?kind=manifest`,
    };
  }

  /**
   * Returns last known status and scan activities.
   * @param {string} awbCode - LOCAL AWB
   * @returns {Promise<ShiprocketTrackingResponse>} Tracking payload
   */
  async trackByAwb(awbCode: string): Promise<ShiprocketTrackingResponse> {
    const row = await this.requireShipmentByAwb(awbCode);
    const activities = row.payload.activities ?? [];
    return {
      tracking_data: {
        awb_code: row.awb ?? awbCode,
        shipment_status: row.status,
        shipment_status_id: 1,
        etd: '',
        shipment_track: [
          {
            current_status: row.status,
            delivered_date:
              row.status === 'DELIVERED' ? new Date().toISOString() : null,
          },
        ],
        shipment_track_activities: activities,
      },
    };
  }

  /**
   * Marks NDR reattempt as in transit.
   * @param {string} awb - LOCAL AWB
   * @returns {Promise<ShiprocketNdrResponse>} Ack
   */
  async ndrReattempt(awb: string): Promise<ShiprocketNdrResponse> {
    const row = await this.requireShipmentByAwb(awb);
    row.status = 'IN TRANSIT';
    await this.shipments.save(row);
    return { message: 'NDR reattempt scheduled', status: 1 };
  }

  /**
   * Marks NDR return as RTO initiated.
   * @param {string} awb - LOCAL AWB
   * @returns {Promise<ShiprocketNdrResponse>} Ack
   */
  async ndrReturn(awb: string): Promise<ShiprocketNdrResponse> {
    const row = await this.requireShipmentByAwb(awb);
    row.status = 'RTO INITIATED';
    await this.shipments.save(row);
    return { message: 'NDR return initiated', status: 1 };
  }

  /**
   * Cancels shipments by mock external order id.
   * @param {number[]} ids - Mock order ids
   * @returns {Promise<ShiprocketCancelResponse>} Ack
   */
  async cancelOrders(ids: number[]): Promise<ShiprocketCancelResponse> {
    if (ids.length === 0) {
      return { message: 'No orders to cancel', status: 1 };
    }
    const rows = await this.shipments.find({
      where: { externalOrderId: In(ids) },
    });
    for (const row of rows) {
      row.status = 'CANCELLED';
      await this.shipments.save(row);
    }
    return { message: 'Orders cancelled', status: 1 };
  }

  /**
   * Upserts a pickup location name.
   * @param {ShiprocketAddPickupRequest} body - Pickup payload
   * @returns {Promise<ShiprocketAddPickupResponse>} Registered location
   */
  async addPickupLocation(
    body: ShiprocketAddPickupRequest,
  ): Promise<ShiprocketAddPickupResponse> {
    const name = body.pickup_location?.trim();
    if (!name) {
      throw new BadRequestException('pickup_location required');
    }
    let row = await this.pickups.findOne({ where: { name } });
    if (!row) {
      row = this.pickups.create({
        name,
        payload: { ...body },
      });
    } else {
      row.payload = { ...body };
    }
    await this.pickups.save(row);
    return {
      message: 'Pickup location added',
      success: true,
      address: {
        id: row.id,
        pickup_location: row.name,
      },
    };
  }

  /**
   * Placeholder label body for generateLabel URLs.
   * @param {number} shipmentId - Mock shipment id
   * @returns {string} Plain-text label
   */
  labelBody(shipmentId: number): string {
    return `Local mock shipping label for shipment ${shipmentId}`;
  }

  /**
   * Updates status, assigns AWB if missing, posts Creato webhook.
   * @param {AdvanceStatusDto} dto - AWB or shipment_id plus status
   * @returns {Promise<AdvanceStatusResult>} Webhook echo
   */
  async advanceStatus(dto: AdvanceStatusDto): Promise<AdvanceStatusResult> {
    const status = (dto.current_status ?? '').toUpperCase().trim();
    if (!ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Unsupported current_status "${dto.current_status}"`,
      );
    }

    let row: MockSrShipment | null = null;
    const awb = dto.awb?.trim();
    if (awb) {
      row = await this.shipments.findOne({ where: { awb } });
    }
    if (!row && dto.shipment_id) {
      row = await this.shipments.findOne({
        where: { id: dto.shipment_id },
      });
    }
    if (!row) {
      throw new NotFoundException('Mock shipment not found');
    }
    if (!row.awb) {
      row.awb = `LOCAL${row.id}`;
    }

    row.status = status;
    const timestamp = this.formatWebhookTimestamp(new Date());
    const activities = [...(row.payload.activities ?? [])];
    activities.push({
      date: timestamp,
      status,
      activity: status,
      location: 'Local Mock Hub',
    });
    row.payload = { ...row.payload, activities };
    await this.shipments.save(row);

    const webhookBody = {
      awb: row.awb,
      current_status: status,
      sr_order_id: String(row.externalOrderId),
      order_id: row.channelOrderId,
      current_timestamp: timestamp,
      is_return: row.isReturn ? 1 : 0,
    };

    const webhookUrl = this.webhookUrl();
    await firstValueFrom(this.http.post(webhookUrl, webhookBody));
    this.logger.log(`Posted mock webhook ${status} for ${row.awb}`);

    return {
      awb: row.awb,
      current_status: status,
      webhook_posted: true,
    };
  }

  /**
   * Builds a webhook body without posting. Used by unit tests.
   * @param {MockSrShipment} row - Saved shipment
   * @param {string} status - Scan status
   * @param {string} timestamp - dd mm yyyy HH:mm:ss
   * @returns {Record<string, string | number>} Webhook fields Creato reads
   */
  buildWebhookBody(
    row: MockSrShipment,
    status: string,
    timestamp: string,
  ): Record<string, string | number> {
    return {
      awb: row.awb ?? '',
      current_status: status,
      sr_order_id: String(row.externalOrderId),
      order_id: row.channelOrderId,
      current_timestamp: timestamp,
      is_return: row.isReturn ? 1 : 0,
    };
  }

  /**
   * Inserts a shipment then stamps external_order_id = id.
   * @param {string} channelOrderId - Seller / channel order ref
   * @param {boolean} isReturn - Reverse leg
   * @param {Record<string, unknown>} create - Raw create body
   * @returns {Promise<MockSrShipment>} Persisted row
   */
  private async insertShipment(
    channelOrderId: string,
    isReturn: boolean,
    create: Record<string, unknown>,
  ): Promise<MockSrShipment> {
    const payload: MockSrShipmentPayload = { create, activities: [] };
    const created = await this.shipments.save(
      this.shipments.create({
        externalOrderId: 0,
        channelOrderId,
        awb: null,
        status: INITIAL_STATUS,
        courierId: null,
        isReturn,
        pickupToken: null,
        labelUrl: null,
        payload,
      }),
    );
    created.externalOrderId = created.id;
    return this.shipments.save(created);
  }

  /**
   * Loads a shipment by numeric id or 404.
   * @param {number} id - Shipment id
   * @returns {Promise<MockSrShipment>} Row
   */
  private async requireShipmentById(id: number): Promise<MockSrShipment> {
    const row = await this.shipments.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Unknown shipment_id ${id}`);
    }
    return row;
  }

  /**
   * Loads a shipment by AWB or 404.
   * @param {string} awb - Tracking number
   * @returns {Promise<MockSrShipment>} Row
   */
  private async requireShipmentByAwb(awb: string): Promise<MockSrShipment> {
    const row = await this.shipments.findOne({ where: { awb } });
    if (!row) {
      throw new NotFoundException(`Unknown AWB ${awb}`);
    }
    return row;
  }

  /**
   * Public base URL for label links.
   * @returns {string} Origin without trailing slash
   */
  private publicUrl(): string {
    return (
      this.config.get<string>('app.shiprocket_mock_public_url') ??
      'http://localhost:4010'
    ).replace(/\/$/, '');
  }

  /**
   * Creato tracking webhook URL.
   * @returns {string} Absolute webhook URL
   */
  private webhookUrl(): string {
    return (
      this.config.get<string>('app.shiprocket_mock_webhook_url') ??
      'http://localhost:3000/api/v1/shipping/webhooks/tracking-updates'
    );
  }

  /**
   * Formats a timestamp the way processWebhook / parseShiprocketTimestamp expect.
   * @param {Date} date - Instant
   * @returns {string} `dd mm yyyy HH:mm:ss`
   */
  private formatWebhookTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      pad(date.getDate()),
      pad(date.getMonth() + 1),
      String(date.getFullYear()),
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    ].join(' ');
  }

  /**
   * Reads a string field from an untyped Shiprocket body.
   * @param {Record<string, unknown>} body - Request body
   * @param {string} key - Field name
   * @returns {string} Trimmed string or empty
   */
  private readString(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    return typeof value === 'string' ? value.trim() : '';
  }
}
