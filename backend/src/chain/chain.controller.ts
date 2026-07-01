import { Body, Controller, Post } from '@nestjs/common';
import { ChainService } from './chain.service';

/**
 * JSON-RPC relay to the Casper node (`POST /casper-rpc`). The browser submits
 * USER-signed transactions + reads through here so it avoids the public node's
 * missing CORS headers and any edge-proxy body/timeout limits. The relay only
 * forwards the raw body — it never signs (the agent key is never on this path).
 */
@Controller()
export class ChainController {
  constructor(private readonly chain: ChainService) {}

  @Post('casper-rpc')
  rpc(@Body() body: unknown): Promise<unknown> {
    return this.chain.relayRpc(body);
  }
}
