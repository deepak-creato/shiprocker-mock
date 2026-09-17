import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AutoDeliverCron, nextHappyStatus } from '../auto-deliver.cron';
import { MockSrShipment } from '../entities/mock-sr-shipment.entity';
import { MockShiprocketService } from '../mock-shiprocket.service';

const AGED_SHIPMENT_ID = 11;
const FRESH_SHIPMENT_ID = 12;

type MockDeps = {
  find?: jest.Mock;
  advanceStatus?: jest.Mock;
  autoDeliver?: boolean;
};

/**
 * Builds a Nest testing module for AutoDeliverCron.
 * @param {Partial<MockDeps>} overrides - Per-test deps
 * @returns {Promise<TestingModule>} Compiled module
 */
async function makeModule(
  overrides: Partial<MockDeps> = {},
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      AutoDeliverCron,
      {
        provide: getRepositoryToken(MockSrShipment),
        useValue: {
          find: overrides.find ?? jest.fn().mockResolvedValue([]),
        },
      },
      {
        provide: MockShiprocketService,
        useValue: {
          advanceStatus:
            overrides.advanceStatus ?? jest.fn().mockResolvedValue({}),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === 'app.shiprocket_mock_auto_deliver') {
              return overrides.autoDeliver ?? true;
            }
            return undefined;
          }),
        },
      },
    ],
  }).compile();
}

describe('nextHappyStatus', () => {
  it('should start forward path from NEW', () => {
    expect(nextHappyStatus({ status: 'NEW', isReturn: false })).toBe(
      'PICKED UP',
    );
  });

  it('should walk forward happy path in order', () => {
    expect(nextHappyStatus({ status: 'PICKED UP', isReturn: false })).toBe(
      'IN TRANSIT',
    );
    expect(nextHappyStatus({ status: 'IN TRANSIT', isReturn: false })).toBe(
      'OUT FOR DELIVERY',
    );
    expect(
      nextHappyStatus({ status: 'OUT FOR DELIVERY', isReturn: false }),
    ).toBe('DELIVERED');
    expect(nextHappyStatus({ status: 'DELIVERED', isReturn: false })).toBeNull();
  });

  it('should walk reverse happy path in order', () => {
    expect(nextHappyStatus({ status: 'NEW', isReturn: true })).toBe(
      'RETURN PICKED UP',
    );
    expect(
      nextHappyStatus({ status: 'RETURN PICKED UP', isReturn: true }),
    ).toBe('RETURN IN TRANSIT');
    expect(
      nextHappyStatus({ status: 'RETURN IN TRANSIT', isReturn: true }),
    ).toBe('RETURN DELIVERED');
    expect(
      nextHappyStatus({ status: 'RETURN DELIVERED', isReturn: true }),
    ).toBeNull();
  });
});

describe('AutoDeliverCron', () => {
  let cron: AutoDeliverCron;
  let find: jest.Mock;
  let advanceStatus: jest.Mock;

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([]);
    advanceStatus = jest.fn().mockResolvedValue({});
    const module = await makeModule({ find, advanceStatus });
    cron = module.get(AutoDeliverCron);
    jest.clearAllMocks();
    find.mockResolvedValue([]);
    advanceStatus.mockResolvedValue({});
  });

  it('should post PICKED UP for aged forward shipments still NEW', async () => {
    // Arrange
    find.mockResolvedValue([
      { id: AGED_SHIPMENT_ID, status: 'NEW', isReturn: false },
    ]);

    // Act
    await cron.deliverAgedShipments();

    // Assert
    expect(advanceStatus).toHaveBeenCalledWith({
      shipment_id: AGED_SHIPMENT_ID,
      current_status: 'PICKED UP',
    });
  });

  it('should post next reverse scan for aged return shipments', async () => {
    // Arrange
    find.mockResolvedValue([
      { id: AGED_SHIPMENT_ID, status: 'RETURN PICKED UP', isReturn: true },
    ]);

    // Act
    await cron.deliverAgedShipments();

    // Assert
    expect(advanceStatus).toHaveBeenCalledWith({
      shipment_id: AGED_SHIPMENT_ID,
      current_status: 'RETURN IN TRANSIT',
    });
  });

  it('should not call advanceStatus when no aged rows', async () => {
    // Arrange
    find.mockResolvedValue([]);

    // Act
    await cron.deliverAgedShipments();

    // Assert
    expect(advanceStatus).not.toHaveBeenCalled();
  });

  it('should skip when auto-deliver is disabled', async () => {
    // Arrange
    const module = await makeModule({
      find,
      advanceStatus,
      autoDeliver: false,
    });
    cron = module.get(AutoDeliverCron);

    // Act
    await cron.deliverAgedShipments();

    // Assert
    expect(find).not.toHaveBeenCalled();
    expect(advanceStatus).not.toHaveBeenCalled();
  });

  it('should keep sweeping when one shipment webhook fails', async () => {
    // Arrange
    find.mockResolvedValue([
      { id: AGED_SHIPMENT_ID, status: 'PICKED UP', isReturn: false },
      { id: FRESH_SHIPMENT_ID, status: 'IN TRANSIT', isReturn: false },
    ]);
    advanceStatus
      .mockRejectedValueOnce(new Error('webhook down'))
      .mockResolvedValueOnce({});

    // Act
    await cron.deliverAgedShipments();

    // Assert
    expect(advanceStatus).toHaveBeenCalledTimes(2);
    expect(advanceStatus).toHaveBeenNthCalledWith(2, {
      shipment_id: FRESH_SHIPMENT_ID,
      current_status: 'OUT FOR DELIVERY',
    });
  });
});
