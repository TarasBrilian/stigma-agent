import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

// Smoke test: the whole DI graph (every module, controller, and provider) must
// resolve. PrismaService is overridden so no DB connection is attempted; we only
// compile the graph, never call lifecycle hooks.
describe('AppModule', () => {
  it('wires the full dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
