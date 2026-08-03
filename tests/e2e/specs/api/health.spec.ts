import { expect, test } from '@playwright/test';

// The API's Jest suite proves the same payload in-process, through a Nest testing
// module. This one proves something that suite structurally cannot: that the
// compiled `dist/main.js` bootstraps, that `AppModule` really imports
// `HealthModule`, and that the service binds the port it was told to and answers
// over a real socket.
test.describe('GET /health on the running service', () => {
  test('answers 200 with the exact health payload', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'devsync-api' });
  });
});
