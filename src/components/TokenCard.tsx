import { Link } from "react-router-dom";
import { TokenLogo } from "./TokenLogo";
import type { GuardianRisk, Token } from "../data/tokens";

const riskStyles: Record<
  GuardianRisk,
  { label: string; dot: string; border: string }
> = {
  SAFE: {
    label: "var(--risk-safe)",
    dot: "var(--risk-safe)",
    border: "rgba(52, 211, 153, 0.35)",
  },
  WARNING: {
    label: "var(--risk-warning)",
    dot: "var(--risk-warning)",
    border: "rgba(251, 191, 36, 0.35)",
  },
  DANGER: {
    label: "var(--risk-danger)",
    dot: "var(--risk-danger)",
    border: "rgba(248, 113, 113, 0.35)",
  },
};

function formatUsd(n: number): string {
  if (n >= 1) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (n >= 0.01) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  });
}

type Props = { token: Token };

export function TokenCard({ token }: Props) {
  const risk = riskStyles[token.guardianRisk];
  const up = token.change24hPct >= 0;
  const marketUrl = token.mintAddress
    ? `https://dexscreener.com/solana/${token.mintAddress}`
    : `https://dexscreener.com/search?q=${encodeURIComponent(token.symbol)}`;

  return (
    <article className="token-card">
      <div className="token-card__top">
        <div className="token-card__identity">
          <TokenLogo token={token} />
          <h2 className="token-card__name">
            <span className="token-card__name-text">{token.name}</span>
            <span className="token-card__symbol">{token.symbol}</span>
          </h2>
        </div>
        <div
          className="token-card__risk"
          style={{ borderColor: risk.border, color: risk.label }}
        >
          <span
            className="token-card__risk-dot"
            style={{ background: risk.dot }}
          />
          Guardian · {token.guardianRisk}
        </div>
      </div>
      <div className="token-card__bottom">
        <div>
          <p className="token-card__muted">Price</p>
          <p className="token-card__price">{formatUsd(token.priceUsd)}</p>
        </div>
        <div className="token-card__change-wrap">
          <p className="token-card__muted">24h</p>
          <p className={`token-card__change ${up ? "is-up" : "is-down"}`}>
            {up ? "+" : ""}
            {token.change24hPct.toFixed(2)}%
          </p>
        </div>
      </div>
      <p className="token-card__message">{token.guardianMessage}</p>
      {token.mintAddress ? (
        <p className="token-card__mint">
          Mint: <span>{token.mintAddress}</span>
        </p>
      ) : null}
      <div className="token-card__actions">
        <a href={marketUrl} target="_blank" rel="noopener noreferrer" className="token-card__trade">
          Buy
        </a>
        <a href={marketUrl} target="_blank" rel="noopener noreferrer" className="token-card__trade">
          Sell
        </a>
        <button type="button" className="token-card__trade token-card__trade--disabled" disabled>
          Coming soon
        </button>
        <Link to={`/token/${token.id}`} className="token-card__details">
          View details
        </Link>
      </div>
    </article>
  );
}
