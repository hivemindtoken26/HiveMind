import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AFFILIATE_TIERS,
  HIVE_DOMAIN,
  STAKING_FEE_BPS,
  STAKING_STATUS,
  STORAGE_KEYS,
  bpsToLabel,
} from "../config/ecosystem";

export function EcosystemHub() {
  const [params] = useSearchParams();
  const intent = params.get("intent");
  const symbol = params.get("symbol");
  const [affiliateHandle, setAffiliateHandle] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.affiliateHandle) ?? "" : "",
  );

  const referralPreview = useMemo(() => {
    const handle = affiliateHandle.trim().replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!handle) return `${HIVE_DOMAIN}/?ref=your-handle`;
    return `${HIVE_DOMAIN}/?ref=${encodeURIComponent(handle)}`;
  }, [affiliateHandle]);

  useEffect(() => {
    if (intent === "stake" || symbol) {
      const el = document.getElementById("hub-staking");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [intent, symbol]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.affiliateHandle, affiliateHandle);
  }, [affiliateHandle]);

  return (
    <div className="page ecosystem-hub">
      <section className="ecosystem-hub__hero marketing-panel">
        <p className="ecosystem-hub__eyebrow">HiveMind ecosystem</p>
        <h1 className="ecosystem-hub__title">Content hub · Affiliates · Token utility · Staking</h1>
        <p className="ecosystem-hub__lede">
          One home for market discovery, partner growth, and planned on-chain staking with transparent protocol
          fees—always subject to wallet connection, program audits, and your own research.
        </p>
      </section>

      <nav className="ecosystem-hub__subnav" aria-label="Ecosystem sections">
        <a href="#hub-content">Content hub</a>
        <a href="#hub-affiliate">Affiliates</a>
        <a href="#hub-utility">Token utility</a>
        <a href="#hub-staking">Staking &amp; fees</a>
      </nav>

      {symbol ? (
        <p className="ecosystem-hub__context" role="status">
          Staking interest: <strong>{symbol}</strong> — fee model below applies once the staking program is live.
        </p>
      ) : null}

      <section id="hub-content" className="ecosystem-hub__section marketing-panel">
        <h2>Content hub</h2>
        <p>
          Centralize discovery and Nexus intelligence: live token feed, search, risk snapshots, and Pulse for accounts and
          Nexus Pro.
        </p>
        <ul className="ecosystem-hub__links">
          <li>
            <Link to="/">Token feed &amp; search</Link>
          </li>
          <li>
            <Link to="/pulse">Pulse · accounts &amp; Nexus Pro</Link>
          </li>
        </ul>
      </section>

      <section id="hub-affiliate" className="ecosystem-hub__section marketing-panel">
        <h2>Affiliate ecosystem</h2>
        <p>
          Share HiveMind with your audience. Final commission rules, cookie windows, and payout rails ship with the
          affiliate program launch. Example tiers below are illustrative only.
        </p>
        <div className="ecosystem-hub__tiers">
          {AFFILIATE_TIERS.map((row) => (
            <article key={row.tier} className="ecosystem-hub__tier-card">
              <p className="ecosystem-hub__tier-name">{row.tier}</p>
              <p className="ecosystem-hub__tier-vol">Qualified volume (example)</p>
              <p className="ecosystem-hub__tier-value">{row.qualifiedVolumeUsd}</p>
              <p className="ecosystem-hub__tier-vol">Example rev share on program subscription events</p>
              <p className="ecosystem-hub__tier-pct">{row.exampleRevSharePct}</p>
            </article>
          ))}
        </div>
        <label className="ecosystem-hub__label" htmlFor="affiliate-handle">
          Your referral handle (saved on this device)
        </label>
        <input
          id="affiliate-handle"
          className="ecosystem-hub__input"
          value={affiliateHandle}
          onChange={(e) => setAffiliateHandle(e.target.value)}
          placeholder="e.g. cryptosara"
          autoComplete="off"
        />
        <p className="ecosystem-hub__ref-url">
          <span>Preview link</span>
          <code>{referralPreview}</code>
        </p>
        <p className="ecosystem-hub__fineprint">
          Affiliates must disclose material connections (FTC / platform rules). No guaranteed income. Payouts only on
          qualified actions per program terms.
        </p>
      </section>

      <section id="hub-utility" className="ecosystem-hub__section marketing-panel">
        <h2>Token utility platform</h2>
        <p>
          HiveMind token utility is designed around access, incentives, and alignment: unlock deeper Nexus Sentinel
          feeds,
          fee discounts, partner campaigns, and (when live) staking participation. Exact tokenomics are published
          separately and may change before launch.
        </p>
        <ul className="ecosystem-hub__bullets">
          <li>Nexus Pro intelligence surfaces in-app</li>
          <li>Partnership tooling via this hub</li>
          <li>Governance placeholders as the community matures</li>
        </ul>
      </section>

      <section id="hub-staking" className="ecosystem-hub__section marketing-panel ecosystem-hub__section--stakes">
        <h2>Staking &amp; protocol fees</h2>
        <p>
          Planned staking pools let users lock eligible assets to support HiveMind liquidity or emissions programs while
          the protocol collects transparent fees—not financial advice; smart-contract risk applies.
        </p>
        <p className="ecosystem-hub__status">
          Program status:{" "}
          <strong>{STAKING_STATUS === "planned" ? "Planned — wallet + program rollout" : "Live"}</strong>
        </p>
        <div className="ecosystem-hub__fee-grid">
          <article>
            <p className="ecosystem-hub__fee-label">Deposit fee</p>
            <p className="ecosystem-hub__fee-value">{bpsToLabel(STAKING_FEE_BPS.deposit)}</p>
          </article>
          <article>
            <p className="ecosystem-hub__fee-label">Withdrawal fee</p>
            <p className="ecosystem-hub__fee-value">{bpsToLabel(STAKING_FEE_BPS.withdrawal)}</p>
          </article>
          <article>
            <p className="ecosystem-hub__fee-label">Protocol share of staking rewards</p>
            <p className="ecosystem-hub__fee-value">{bpsToLabel(STAKING_FEE_BPS.rewardsProtocol)}</p>
          </article>
        </div>
        <p className="ecosystem-hub__fineprint">
          Fees shown are configurable design targets for the staking program minted on Solana—the final schedule will appear
          in on-chain configs and audited program docs before money moves.
        </p>
        <div className="ecosystem-hub__wallet-actions">
          <a
            className="ecosystem-hub__phantom"
            href="https://phantom.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get Phantom Wallet
          </a>
          <Link to="/terms">Read Terms of Service</Link>
        </div>
      </section>
    </div>
  );
}
