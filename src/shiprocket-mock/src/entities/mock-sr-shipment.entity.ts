import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Stored create payload plus scan activities for track/webhook. */
export type MockSrShipmentPayload = {
  create?: Record<string, unknown>;
  activities?: Array<{
    date: string;
    status: string;
    activity: string;
    location: string;
  }>;
};

/**
 * Fake Shiprocket shipment owned by shiprocket-mock only.
 * `id` is the numeric `shipment_id` returned to order-service.
 */
@Entity('mock_sr_shipments')
export class MockSrShipment {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number;

  @Column('int', { name: 'external_order_id' })
  externalOrderId: number;

  @Column('varchar', { name: 'channel_order_id', length: 100 })
  channelOrderId: string;

  @Column('varchar', { name: 'awb', length: 50, nullable: true })
  awb: string | null;

  @Column('varchar', { name: 'status', length: 50 })
  status: string;

  @Column('int', { name: 'courier_id', nullable: true })
  courierId: number | null;

  @Column('boolean', { name: 'is_return', default: false })
  isReturn: boolean;

  @Column('varchar', { name: 'pickup_token', length: 100, nullable: true })
  pickupToken: string | null;

  @Column('text', { name: 'label_url', nullable: true })
  labelUrl: string | null;

  @Column('jsonb', { name: 'payload', default: {} })
  payload: MockSrShipmentPayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
