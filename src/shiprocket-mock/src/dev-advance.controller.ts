import { Body, Controller, Post } from '@nestjs/common';
import { AdvanceStatusDto } from './dto/advance-status.dto';
import {
  AdvanceStatusResult,
  MockShiprocketService,
} from './mock-shiprocket.service';

/**
 * Dev-only status advance that POSTs Creato's tracking webhook.
 */
@Controller('dev')
export class DevAdvanceController {
  /**
   * @param {MockShiprocketService} mock - Fake Shiprocket domain
   */
  constructor(private readonly mock: MockShiprocketService) {}

  /**
   * Advances a mock shipment and notifies Creato.
   * @param {AdvanceStatusDto} body - AWB or shipment_id plus status
   * @returns {Promise<AdvanceStatusResult>} AWB and posted status
   */
  @Post('advance-status')
  advanceStatus(@Body() body: AdvanceStatusDto): Promise<AdvanceStatusResult> {
    return this.mock.advanceStatus(body);
  }
}
