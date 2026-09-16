import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { Repository } from 'typeorm';
import { MockSrPickupLocation } from '../entities/mock-sr-pickup-location.entity';
import { MockSrShipment } from '../entities/mock-sr-shipment.entity';
import { MockShiprocketService } from '../mock-shiprocket.service';

const SHIPMENT_ID = 7;
const EXTERNAL_ORDER_ID = 7;
const CHANNEL_ORDER_ID = 'SO-1001';
const AWB = 'LOCAL7';
const WEBHOOK_URL =
  'http://localhost:3000/api/v1/shipping/webhooks/tracking-updates';

type MockDeps = {
  shipments?: Partial<
    Pick<Repository<MockSrShipment>, 'findOne' | 'find' | 'save' | 'create'>
  >;
  http?: { post: jest.Mock };
};

/**
 * Builds a Nest testing module for MockShiprocketService.
 * @param {Partial<MockDeps>} overrides - Per-test repo/http overrides
 * @returns {Promise<TestingModule>} Compiled module
 */
async function makeModule(
  overrides: Partial<MockDeps> = {},
): Promise<TestingModule> {
  const defaultSave = jest
    .fn()
    .mockImplementation((row: MockSrShipment) =>
      Promise.resolve({ ...row, id: row.id || SHIPMENT_ID }),
    );
  const defaultCreate = jest
    .fn()
    .mockImplementation((row: Partial<MockSrShipment>) => ({ ...row }));

  return Test.createTestingModule({
    providers: [
      MockShiprocketService,
      {
        provide: getRepositoryToken(MockSrShipment),
        useValue: {
          findOne: jest.fn(),
          find: jest.fn().mockResolvedValue([]),
          save: defaultSave,
          create: defaultCreate,
          ...overrides.shipments,
        },
      },
      {
        provide: getRepositoryToken(MockSrPickupLocation),
        useValue: {
          findOne: jest.fn(),
          save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
          create: jest.fn().mockImplementation((row) => row),
        },
      },
      {
        provide: HttpService,
        useValue: {
          post: overrides.http?.post ?? jest.fn().mockReturnValue(of({})),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === 'app.shiprocket_mock_webhook_url') {
              return WEBHOOK_URL;
            }
            if (key === 'app.shiprocket_mock_public_url') {
              return 'http://localhost:4010';
            }
            return undefined;
          }),
        },
      },
    ],
  }).compile();
}

/**
 * @param {Partial<MockSrShipment>} overrides - Row fields
 * @returns {MockSrShipment} Fake shipment
 */
function makeShipment(overrides: Partial<MockSrShipment> = {}): MockSrShipment {
  return {
    id: SHIPMENT_ID,
    externalOrderId: EXTERNAL_ORDER_ID,
    channelOrderId: CHANNEL_ORDER_ID,
    awb: AWB,
    status: 'AWB ASSIGNED',
    courierId: 1,
    isReturn: false,
    pickupToken: null,
    labelUrl: null,
    payload: { activities: [] },
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    updatedAt: new Date('2026-09-10T10:00:00.000Z'),
    ...overrides,
  };
}

describe('MockShiprocketService', () => {
  let service: MockShiprocketService;
  let shipments: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let http: { post: jest.Mock };

  beforeEach(async () => {
    const module = await makeModule();
    service = module.get(MockShiprocketService);
    shipments = module.get(getRepositoryToken(MockSrShipment));
    http = module.get(HttpService);
    jest.clearAllMocks();
    http.post.mockReturnValue(of({}));
  });

  describe('createShipment + assignAwb + advanceStatus', () => {
    it('should post DELIVERED webhook with assigned AWB', async () => {
      // Arrange
      let stored: MockSrShipment | null = null;
      shipments.create.mockImplementation(
        (row: Partial<MockSrShipment>) => row,
      );
      shipments.save.mockImplementation((row: MockSrShipment) => {
        const saved = {
          ...row,
          id: row.id || SHIPMENT_ID,
          externalOrderId: row.externalOrderId || SHIPMENT_ID,
        };
        stored = saved;
        return Promise.resolve(saved);
      });
      shipments.findOne.mockImplementation(() => Promise.resolve(stored));

      // Act
      const created = await service.createShipment(
        { order_id: CHANNEL_ORDER_ID },
        false,
      );
      const awbRes = await service.assignAwb(created.shipment_id, 1);
      const advanced = await service.advanceStatus({
        awb: awbRes.response.data.awb_code,
        current_status: 'DELIVERED',
      });

      // Assert
      expect(created.shipment_id).toBe(SHIPMENT_ID);
      expect(awbRes.awb_assign_status).toBe(1);
      expect(awbRes.response.data.awb_code).toBe(AWB);
      expect(advanced.awb).toBe(AWB);
      expect(advanced.current_status).toBe('DELIVERED');
      expect(http.post).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          awb: AWB,
          current_status: 'DELIVERED',
          sr_order_id: String(EXTERNAL_ORDER_ID),
          order_id: CHANNEL_ORDER_ID,
          is_return: 0,
        }),
      );
    });
  });

  describe('advanceStatus', () => {
    it('should assign LOCAL AWB when only shipment_id is given', async () => {
      // Arrange
      const row = makeShipment({ awb: null, status: 'NEW' });
      shipments.findOne.mockResolvedValue(row);

      // Act
      const result = await service.advanceStatus({
        shipment_id: SHIPMENT_ID,
        current_status: 'PICKED UP',
      });

      // Assert
      expect(result.awb).toBe(AWB);
      expect(http.post).toHaveBeenCalledWith(
        WEBHOOK_URL,
        expect.objectContaining({
          awb: AWB,
          current_status: 'PICKED UP',
        }),
      );
    });

    it('should reject unknown current_status without posting webhook', async () => {
      // Arrange
      const row = makeShipment();
      shipments.findOne.mockResolvedValue(row);

      // Act & Assert
      await expect(
        service.advanceStatus({
          awb: AWB,
          current_status: 'NOT A REAL STATUS',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(http.post).not.toHaveBeenCalled();
      expect(shipments.save).not.toHaveBeenCalled();
    });

    it('should reject missing shipment without posting webhook', async () => {
      // Arrange
      shipments.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.advanceStatus({
          awb: 'LOCAL-MISSING',
          current_status: 'DELIVERED',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(http.post).not.toHaveBeenCalled();
      expect(shipments.save).not.toHaveBeenCalled();
    });
  });

  describe('buildWebhookBody', () => {
    it('should map Creato webhook fields from the mock row', () => {
      // Arrange
      const row = makeShipment({ isReturn: true });
      const timestamp = '10 09 2026 16:00:00';

      // Act
      const body = service.buildWebhookBody(row, 'DELIVERED', timestamp);

      // Assert
      expect(body).toEqual({
        awb: AWB,
        current_status: 'DELIVERED',
        sr_order_id: String(EXTERNAL_ORDER_ID),
        order_id: CHANNEL_ORDER_ID,
        current_timestamp: timestamp,
        is_return: 1,
      });
    });
  });

  describe('checkServiceability', () => {
    it('should return one mock courier', () => {
      // Arrange
      // Act
      const result = service.checkServiceability();

      // Assert
      expect(result.status).toBe(200);
      expect(result.data.available_courier_companies).toHaveLength(1);
      expect(
        result.data.available_courier_companies[0].courier_company_id,
      ).toBe(1);
    });
  });
});
