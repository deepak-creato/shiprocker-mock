import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { MockShiprocketService } from './mock-shiprocket.service';

/**
 * Serves placeholder label text for generateLabel URLs.
 */
@Controller('labels')
export class LabelsController {
  /**
   * @param {MockShiprocketService} mock - Fake Shiprocket domain
   */
  constructor(private readonly mock: MockShiprocketService) {}

  /**
   * Returns a plain-text mock label.
   * @param {number} shipmentId - Mock shipment id
   * @returns {string} Label body
   */
  @Get(':shipmentId')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getLabel(@Param('shipmentId', ParseIntPipe) shipmentId: number): string {
    return this.mock.labelBody(shipmentId);
  }
}
