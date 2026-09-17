import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Logger,
  NestInterceptor,
  Param,
  Post,
  Query,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type {
  ShiprocketAddPickupRequest,
  ShiprocketAddPickupResponse,
  ShiprocketAssignAWBRequest,
  ShiprocketAssignAWBResponse,
  ShiprocketAuthRequest,
  ShiprocketAuthResponse,
  ShiprocketCancelRequest,
  ShiprocketCancelResponse,
  ShiprocketCreateExchangeOrderResponse,
  ShiprocketCreateOrderResponse,
  ShiprocketLabelRequest,
  ShiprocketLabelResponse,
  ShiprocketManifestRequest,
  ShiprocketManifestResponse,
  ShiprocketNdrReattemptRequest,
  ShiprocketNdrResponse,
  ShiprocketNdrReturnRequest,
  ShiprocketPickupRequest,
  ShiprocketPickupResponse,
  ShiprocketServiceabilityResponse,
  ShiprocketTrackingResponse,
} from './shiprocket.types';
import { MockShiprocketService } from './mock-shiprocket.service';

@Injectable()
class RequestResponseLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('MockShiprocketController');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body?: unknown;
      query?: unknown;
      params?: unknown;
    }>();
    this.logger.log(
      `req ${req.method} ${req.url} ${JSON.stringify({
        params: req.params ?? {},
        query: req.query ?? {},
        body: req.body ?? {},
      })}`,
    );
    return next.handle().pipe(
      tap((response: unknown) => {
        this.logger.log(
          `res ${req.method} ${req.url} ${JSON.stringify(response)}`,
        );
      }),
    );
  }
}

/**
 * Clones Shiprocket `/v1/external` paths used by ShiprocketService.
 */
@Controller('v1/external')
@UseInterceptors(RequestResponseLogInterceptor)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: false,
  }),
)
export class MockShiprocketController {
  /**
   * @param {MockShiprocketService} mock - Fake Shiprocket domain
   */
  constructor(private readonly mock: MockShiprocketService) {}

  /**
   * Fake login. Any credentials succeed.
   * @param {ShiprocketAuthRequest} body - Email/password
   * @returns {ShiprocketAuthResponse} Fake JWT
   */
  @Post('auth/login')
  login(@Body() body: ShiprocketAuthRequest): ShiprocketAuthResponse {
    return this.mock.login(body?.email ?? '');
  }

  /**
   * Always-available mock courier.
   * @param {Record<string, string>} _query - Unused serviceability query
   * @returns {ShiprocketServiceabilityResponse} One courier
   */
  @Get(['courier/serviceability', 'courier/serviceability/'])
  checkServiceability(
    @Query() _query: Record<string, string>,
  ): ShiprocketServiceabilityResponse {
    return this.mock.checkServiceability();
  }

  /**
   * Forward shipment create.
   * @param {Record<string, unknown>} body - Adhoc create payload
   * @returns {Promise<ShiprocketCreateOrderResponse>} Ids
   */
  @Post('orders/create/adhoc')
  createAdhoc(
    @Body() body: Record<string, unknown>,
  ): Promise<ShiprocketCreateOrderResponse> {
    return this.mock.createShipment(body ?? {}, false);
  }

  /**
   * Reverse shipment create.
   * @param {Record<string, unknown>} body - Return create payload
   * @returns {Promise<ShiprocketCreateOrderResponse>} Ids
   */
  @Post('orders/create/return')
  createReturn(
    @Body() body: Record<string, unknown>,
  ): Promise<ShiprocketCreateOrderResponse> {
    return this.mock.createShipment(body ?? {}, true);
  }

  /**
   * Exchange: forward + return legs.
   * @param {Record<string, unknown>} body - Exchange payload
   * @returns {Promise<ShiprocketCreateExchangeOrderResponse>} Both legs
   */
  @Post('orders/create/exchange')
  createExchange(
    @Body() body: Record<string, unknown>,
  ): Promise<ShiprocketCreateExchangeOrderResponse> {
    return this.mock.createExchange(body ?? {});
  }

  /**
   * Assigns LOCAL AWB.
   * @param {ShiprocketAssignAWBRequest} body - Shipment + courier
   * @returns {Promise<ShiprocketAssignAWBResponse>} AWB
   */
  @Post('courier/assign/awb')
  assignAwb(
    @Body() body: ShiprocketAssignAWBRequest,
  ): Promise<ShiprocketAssignAWBResponse> {
    return this.mock.assignAwb(
      Number(body.shipment_id),
      Number(body.courier_id),
    );
  }

  /**
   * Schedules pickup.
   * @param {ShiprocketPickupRequest} body - Shipment ids
   * @returns {Promise<ShiprocketPickupResponse>} Pickup token
   */
  @Post('courier/generate/pickup')
  requestPickup(
    @Body() body: ShiprocketPickupRequest,
  ): Promise<ShiprocketPickupResponse> {
    return this.mock.requestPickup(body.shipment_id ?? []);
  }

  /**
   * Generates a mock label URL.
   * @param {ShiprocketLabelRequest} body - Shipment ids
   * @returns {Promise<ShiprocketLabelResponse>} Label URL
   */
  @Post('courier/generate/label')
  generateLabel(
    @Body() body: ShiprocketLabelRequest,
  ): Promise<ShiprocketLabelResponse> {
    return this.mock.generateLabel(body.shipment_id ?? []);
  }

  /**
   * Placeholder manifest URL.
   * @param {ShiprocketManifestRequest} body - Shipment ids
   * @returns {ShiprocketManifestResponse} Manifest URL
   */
  @Post('manifests/generate')
  generateManifest(
    @Body() body: ShiprocketManifestRequest,
  ): ShiprocketManifestResponse {
    return this.mock.generateManifest(body.shipment_id ?? []);
  }

  /**
   * Track by AWB.
   * @param {string} awb - Tracking number
   * @returns {Promise<ShiprocketTrackingResponse>} Tracking
   */
  @Get('courier/track/awb/:awb')
  trackByAwb(@Param('awb') awb: string): Promise<ShiprocketTrackingResponse> {
    return this.mock.trackByAwb(awb);
  }

  /**
   * NDR reattempt.
   * @param {ShiprocketNdrReattemptRequest} body - AWB + optional address
   * @returns {Promise<ShiprocketNdrResponse>} Ack
   */
  @Post('ndr/reattempt')
  ndrReattempt(
    @Body() body: ShiprocketNdrReattemptRequest,
  ): Promise<ShiprocketNdrResponse> {
    return this.mock.ndrReattempt(body.awb);
  }

  /**
   * NDR return / RTO.
   * @param {ShiprocketNdrReturnRequest} body - AWB
   * @returns {Promise<ShiprocketNdrResponse>} Ack
   */
  @Post('ndr/return')
  ndrReturn(
    @Body() body: ShiprocketNdrReturnRequest,
  ): Promise<ShiprocketNdrResponse> {
    return this.mock.ndrReturn(body.awb);
  }

  /**
   * Cancel by mock order ids.
   * @param {ShiprocketCancelRequest} body - Order ids
   * @returns {Promise<ShiprocketCancelResponse>} Ack
   */
  @Post('orders/cancel')
  cancelOrders(
    @Body() body: ShiprocketCancelRequest,
  ): Promise<ShiprocketCancelResponse> {
    return this.mock.cancelOrders(body.ids ?? []);
  }

  /**
   * Registers a pickup location name.
   * @param {ShiprocketAddPickupRequest} body - Warehouse payload
   * @returns {Promise<ShiprocketAddPickupResponse>} Location
   */
  @Post('settings/company/addpickup')
  addPickupLocation(
    @Body() body: ShiprocketAddPickupRequest,
  ): Promise<ShiprocketAddPickupResponse> {
    return this.mock.addPickupLocation(body);
  }
}
