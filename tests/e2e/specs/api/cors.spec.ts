import { expect, test } from '@playwright/test';

// The API's fast Jest suite proves the CORS settings against an application it
// configures itself. This one proves something that suite structurally cannot:
// that the **running** service read `WEB_ORIGIN` from its environment and is
// answering the origin the browser in this suite actually loads from.
//
// The port here is the one `playwright.config.ts` starts the web application on.
const WEB_ORIGIN = 'http://127.0.0.1:4310';

test.describe('cross-origin requests to the running service', () => {
  test('allows the configured web origin, and no wildcard', async ({ request }) => {
    const response = await request.get('/projects', { headers: { Origin: WEB_ORIGIN } });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe(WEB_ORIGIN);
  });

  test('gives another origin no allow-origin header, and allows no credentials', async ({
    request,
  }) => {
    const response = await request.get('/projects', {
      headers: { Origin: 'http://evil.example' },
    });

    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
    expect(response.headers()['access-control-allow-credentials']).toBeUndefined();
  });
});
