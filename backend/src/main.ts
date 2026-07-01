import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Large JSON bodies: a user-signed Vault deploy carries the ~313 KB Vault.wasm
  // (hex-encoded → ~1 MB payload) when the browser submits it through the
  // /casper-rpc relay — well over Express's 100 KB default.
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '15mb' });

  // Allow the Next.js frontend to call the API. FRONTEND_ORIGIN="*" reflects any
  // origin (open — used for the testnet demo deploy where the frontend is on
  // Vercel); otherwise only the named origin is allowed.
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({ origin: frontendOrigin === '*' ? true : frontendOrigin });

  // Validate + strip unknown fields on every DTO.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Bind to localhost by default so the app stays PRIVATE behind the reverse
  // proxy (Caddy → 127.0.0.1:3001); the raw port is never exposed to the
  // internet. Set HOST=0.0.0.0 to bind all interfaces (containers / behind a LB).
  await app.listen(process.env.PORT ?? 3001, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
