/**
 * Hermetic runtime boot smoke: starts the FULL Nest app (no DB / chain / network)
 * and exercises the new auth + rate-limit wiring end to end — proving the route
 * guards actually RESOLVE and run, which the DI-compile smoke (app.module.spec)
 * cannot, since guards are instantiated when routes are registered at init.
 *
 * Asserts (1) the app boots with WalletAuthGuard + ThrottlerGuard attached,
 * (2) an open route still serves, and (3) the demo-endpoint rate limit actually
 * triggers a 429 once the per-route budget is exhausted.
 */
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { ChainService } from './chain/chain.service';
import { AgentService } from './agent/agent.service';
import { KeeperService } from './keeper/keeper.service';

describe('App boot (auth + rate-limit wiring)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    delete process.env.AUTH_REQUIRED; // demo mode: WalletAuthGuard is a no-op here
    const keeperStub = {
      faucet: jest.fn().mockResolvedValue(undefined),
      setOracleOverride: jest.fn().mockResolvedValue(undefined),
      triggerRebalance: jest
        .fn()
        .mockResolvedValue({ executed: false, reason: 'stub' }),
      investIdle: jest
        .fn()
        .mockResolvedValue({ invested: false, reason: 'stub' }),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ChainService)
      .useValue({})
      .overrideProvider(AgentService)
      .useValue({})
      .overrideProvider(KeeperService)
      .useValue(keeperStub)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init(); // resolves + attaches all route guards (the real test)
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots and serves an open (unguarded) route', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('rate-limits the demo endpoints (a 429 appears once the budget is spent)', async () => {
    const body = { owner: 'account-hash-aa', amount: '1000000' };
    let firstStatus = 0;
    let got429 = false;
    // The default budget is 30/window; hammer past it and assert the guard bites.
    for (let i = 0; i < 40; i++) {
      const res = await request(app.getHttpServer())
        .post('/faucet/musdc')
        .send(body);
      if (i === 0) firstStatus = res.status;
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(firstStatus).toBeLessThan(400); // allowed within budget
    expect(got429).toBe(true); // ThrottlerGuard is wired + enforcing
  });
});
