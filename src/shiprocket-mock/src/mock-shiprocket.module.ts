import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoDeliverCron } from './auto-deliver.cron';
import { DevAdvanceController } from './dev-advance.controller';
import { MockSrPickupLocation } from './entities/mock-sr-pickup-location.entity';
import { MockSrShipment } from './entities/mock-sr-shipment.entity';
import { LabelsController } from './labels.controller';
import { MockShiprocketController } from './mock-shiprocket.controller';
import { MockShiprocketService } from './mock-shiprocket.service';

/**
 * Local Shiprocket HTTP clone + dev advance endpoint.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MockSrShipment, MockSrPickupLocation]),
    HttpModule.register({ timeout: 10_000 }),
  ],
  controllers: [
    MockShiprocketController,
    DevAdvanceController,
    LabelsController,
  ],
  providers: [MockShiprocketService, AutoDeliverCron],
})
export class MockShiprocketModule {}
