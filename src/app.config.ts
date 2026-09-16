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
  },
});
