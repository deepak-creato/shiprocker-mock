# shiprocket-mock

Local HTTP clone of the Shiprocket paths `ShiprocketService` calls.
Dev only. Refuses to start when `NODE_ENV=production`.

## Setup

1. Run the mock migration against the same local Postgres:

```bash
pnpm run postgres:migration:run shiprocket-mock
```

2. In `.env`:

```bash
SHIPROCKET_BASE_URL=http://localhost:4010/v1/external
SHIPPING_DEFAULT_PROVIDER=shiprocket
SHIPPING_ENABLED_PROVIDERS=shiprocket
```

3. Start mock, then gateway + order-service:

```bash
pnpm start:dev shiprocket-mock
pnpm start:dev order-service
pnpm start:dev api-gateway
```

Seller warehouse must already exist in Creato tables.

## Flow

1. Place order, ready-to-ship, generate label, schedule pickup (real Creato APIs).
2. Advance courier scans on the mock:

```bash
curl -X POST http://localhost:4010/dev/advance-status \
  -H 'Content-Type: application/json' \
  -d '{"awb":"LOCAL1","current_status":"DELIVERED"}'
```

Allowed statuses: `PICKED UP`, `IN TRANSIT`, `OUT FOR DELIVERY`, `DELIVERED`,
`FAILED DELIVERY`, `RTO INITIATED`, `RTO DELIVERED`, `RETURNED`,
`RETURN PICKED UP`, `RETURN IN TRANSIT`, `RETURN DELIVERED`, `QC FAILED`.

You can pass `shipment_id` instead of `awb`. Missing AWB is assigned as `LOCAL{id}` before the webhook fires.

The mock POSTs
`/api/v1/shipping/webhooks/tracking-updates`
so `processShiprocketWebhook` / `markDeliveredInternal` run for real.

## Auto-advance

A minute cron walks happy-path scans on mock shipments whose `created_at` is
at least `SHIPROCKET_MOCK_AUTO_EVENT_AFTER_MIN` minutes old (default `1`).
One status per tick. `SHIPROCKET_MOCK_AUTO_DELIVER=true` by default.

Forward: `PICKED UP` → `IN TRANSIT` → `OUT FOR DELIVERY` → `DELIVERED`.
Reverse: `RETURN PICKED UP` → `RETURN IN TRANSIT` → `RETURN DELIVERED`.

Set `SHIPROCKET_MOCK_AUTO_DELIVER=false` to keep manual `/dev/advance-status`
only. Negative statuses (`FAILED DELIVERY`, `RTO INITIATED`, `RTO DELIVERED`,
`RETURNED`, `QC FAILED`) and already-terminal rows are skipped.
