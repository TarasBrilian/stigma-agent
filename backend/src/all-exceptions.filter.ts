import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/**
 * Global catch-all so a non-HTTP error never leaks a bad HTTP status. Casper
 * JSON-RPC errors carry a numeric `code` (e.g. -32016 "insufficient funds") that
 * NestJS's default handler would pass to `res.status()` → an "Invalid status
 * code" RangeError → an opaque 500. Map any non-HttpException to a clean 500 that
 * carries the REAL message (so the UI shows "execute_buy failed: …" and it is
 * logged server-side), while HttpExceptions keep their intended status.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    if (exception instanceof HttpException) {
      httpAdapter.reply(
        ctx.getResponse(),
        exception.getResponse(),
        exception.getStatus(),
      );
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    this.logger.error(`Unhandled error: ${message}`);
    httpAdapter.reply(ctx.getResponse(), { statusCode: 500, message }, 500);
  }
}
