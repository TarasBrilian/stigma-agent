import { explorerTxUrl } from "@/lib/constants";
import { truncateHash } from "@/lib/format";

/**
 * A transaction hash rendered as a link to the cspr.live explorer (new tab).
 * Used wherever a signed action reports its tx hash (faucet, deposit, withdraw…).
 */
export function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-gold-deep underline decoration-dotted underline-offset-2 transition-colors hover:text-gold"
    >
      tx: {truncateHash(hash)}
    </a>
  );
}
