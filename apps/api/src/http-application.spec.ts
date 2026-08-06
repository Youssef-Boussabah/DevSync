import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { HealthModule } from './health/health.module';
import {
  CORS_ALLOWED_HEADERS,
  CORS_METHODS,
  HTTP_APPLICATION_OPTIONS,
  configureHttpApplication,
} from './http-application';

// The cross-origin boundary C3 opened, proved without a database.
//
// It boots a real Nest application through the same `configureHttpApplication`
// that `main.ts` calls, so the CORS settings under test are the ones that run.
// `HealthModule` is the module used because CORS is middleware in front of the
// router: what it does to a request has nothing to do with which route the
// request was going to reach, and a preflight never reaches one at all.
//
// Nothing here is a claim about a project route. Those are covered against a real
// PostgreSQL by `pnpm test:db`, and they run with this same configuration.

const WEB_ORIGIN = 'http://127.0.0.1:4310';
const OTHER_ORIGIN = 'http://evil.example';

const ALLOW_ORIGIN = 'access-control-allow-origin';
const ALLOW_CREDENTIALS = 'access-control-allow-credentials';

describe('the HTTP application', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>(HTTP_APPLICATION_OPTIONS);
    configureHttpApplication(app, { webOrigin: WEB_ORIGIN });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    // `NestExpressApplication` already types this as an `http.Server`, so no
    // assertion is needed here — unlike the health spec, which holds the wider
    // `INestApplication`.
    return request(app.getHttpServer());
  }

  describe('cross-origin requests', () => {
    it('allows exactly the configured web origin', async () => {
      const response = await http().get('/health').set('Origin', WEB_ORIGIN);

      expect(response.status).toBe(200);
      expect(response.headers[ALLOW_ORIGIN]).toBe(WEB_ORIGIN);
    });

    it('never answers with a wildcard', async () => {
      const response = await http().get('/health').set('Origin', WEB_ORIGIN);

      expect(response.headers[ALLOW_ORIGIN]).not.toBe('*');
    });

    it('varies on Origin, so one origin cannot be served a cached answer meant for another', async () => {
      const response = await http().get('/health').set('Origin', WEB_ORIGIN);

      expect(response.headers.vary).toContain('Origin');
    });

    it('sends no allow-origin header to any other origin', async () => {
      const response = await http().get('/health').set('Origin', OTHER_ORIGIN);

      // The request itself still succeeds — CORS is enforced by the browser, not
      // by refusing to answer. What the browser needs in order to hand the body
      // to the page is the header, and it is not there.
      expect(response.status).toBe(200);
      expect(response.headers[ALLOW_ORIGIN]).toBeUndefined();
    });

    it('never reflects an arbitrary origin back at it', async () => {
      const response = await http().get('/health').set('Origin', 'http://127.0.0.1:4310.evil.test');

      expect(response.headers[ALLOW_ORIGIN]).toBeUndefined();
    });

    it('allows no credentials, because DevSync sends none', async () => {
      const response = await http().get('/health').set('Origin', WEB_ORIGIN);

      expect(response.headers[ALLOW_CREDENTIALS]).toBeUndefined();
    });

    it('leaves a request without an Origin header alone, so non-browser clients are unaffected', async () => {
      const response = await http().get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', service: 'devsync-api' });
      expect(response.headers[ALLOW_ORIGIN]).toBeUndefined();
    });
  });

  describe('preflight', () => {
    // Answered by the middleware in front of the router, which is why a preflight
    // for a path this module does not serve is still the real answer a browser
    // would get from the running API.
    function preflight(origin: string, method: string) {
      return http()
        .options('/projects')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', method)
        .set('Access-Control-Request-Headers', 'content-type');
    }

    it.each([...CORS_METHODS])('answers a %s preflight from the web origin', async (method) => {
      const response = await preflight(WEB_ORIGIN, method);

      expect(response.status).toBe(204);
      expect(response.headers[ALLOW_ORIGIN]).toBe(WEB_ORIGIN);
    });

    it('names every method the client uses, and no other', async () => {
      const response = await preflight(WEB_ORIGIN, 'PATCH');
      const allowed = response.headers['access-control-allow-methods']
        ?.split(',')
        .map((method) => method.trim());

      expect(allowed).toEqual([...CORS_METHODS]);
      expect(allowed).not.toContain('PUT');
    });

    it('allows the one request header a JSON body needs, and no other', async () => {
      const response = await preflight(WEB_ORIGIN, 'POST');

      expect(response.headers['access-control-allow-headers']).toBe(
        [...CORS_ALLOWED_HEADERS].join(','),
      );
    });

    it('exposes no response header beyond the defaults a browser already reads', async () => {
      const response = await preflight(WEB_ORIGIN, 'GET');

      expect(response.headers['access-control-expose-headers']).toBeUndefined();
    });

    it('gives another origin no allow-origin header to work with', async () => {
      const response = await preflight(OTHER_ORIGIN, 'DELETE');

      expect(response.headers[ALLOW_ORIGIN]).toBeUndefined();
      expect(response.headers[ALLOW_CREDENTIALS]).toBeUndefined();
    });
  });

  it('answers the health payload the rest of the system waits on, unchanged', async () => {
    const response = await http().get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'devsync-api' });
  });
});
