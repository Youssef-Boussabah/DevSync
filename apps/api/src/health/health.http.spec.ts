import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HealthModule } from './health.module';

// An HTTP-level application test, not a unit test. It compiles the real
// `HealthModule`, boots a Nest application from it, and drives the endpoint
// through the framework's routing, serialisation, and status handling — the same
// path a client takes. Supertest binds an ephemeral socket for the request, so
// nothing here depends on a fixed port or on a server already running.
//
// What it deliberately does not prove: that `main.ts` bootstraps, that
// `AppModule` imports `HealthModule`, or that the compiled output in `dist`
// serves anything. Those are failure modes of the built process rather than of
// the health feature, and the Playwright suite in `tests/e2e` covers them by
// starting the real service.
describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with the DevSync API health payload', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'devsync-api' });
  });
});
