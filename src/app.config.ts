export const appConfig = () => ({
  app: {
    shiprocket_mock_port: process.env.PORT ?? '4010',
    shiprocket_mock_public_url:
      process.env.SHIPROCKET_MOCK_PUBLIC_URL ?? 'http://localhost:4010',
    shiprocket_mock_webhook_url:
      process.env.SHIPROCKET_MOCK_WEBHOOK_URL ??
      'http://localhost:3000/api/v1/shipping/webhooks/tracking-updates',
    shiprocket_mock_auto_deliver:
      process.env.SHIPROCKET_MOCK_AUTO_DELIVER !== 'false',
    shiprocket_mock_auto_event_after_min: parseAfterMin(
      process.env.SHIPROCKET_MOCK_AUTO_EVENT_AFTER_MIN,
    ),
  },
});

/**
 * First-scan delay in minutes. Invalid / missing → 1.
 * @param {string | undefined} raw - Env value
 * @returns {number} Minutes, always > 0
 */
function parseAfterMin(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
