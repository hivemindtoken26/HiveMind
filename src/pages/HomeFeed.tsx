import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TokenCard } from "../components/TokenCard";
import { sampleTokens, type Token } from "../data/tokens";
import { getSentinelIdleMessage, getSentinelMessage } from "../lib/watcherVoice";
import { fetchMvpTokenFeed } from "../services/marketDataService";

export function HomeFeed() {
  const [allTokens, setAllTokens] = useState<Token[]>(sampleTokens);
  const [trendingTokens, setTrendingTokens] = useState<Token[]>(
    sampleTokens
      .slice()
      .sort((a, b) => b.change24hPct - a.change24hPct)
      .slice(0, 3),
  );
  const [guardianAlerts, setGuardianAlerts] = useState<Token[]>(
    sampleTokens.filter((token) => token.guardianRisk !== "SAFE"),
  );
  const [saferTokens, setSaferTokens] = useState<Token[]>(
    sampleTokens.filter((token) => token.guardianRisk === "SAFE"),
  );
  const [feedSource, setFeedSource] = useState<"live" | "mock">("mock");
  const [dexLiveCount, setDexLiveCount] = useState(0);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [sentinelIdle, setSentinelIdle] = useState(getSentinelIdleMessage(Date.now()));
  const [coinSearch, setCoinSearch] = useState("");

  useEffect(() => {
    setFeedError(null);
    setSentinelIdle(getSentinelIdleMessage(Date.now()));
    fetchMvpTokenFeed()
      .then((data) => {
        setAllTokens(data.all);
        setTrendingTokens(data.trending);
        setGuardianAlerts(data.alerts);
        setSaferTokens(data.verified);
        setFeedSource(data.source);
        setDexLiveCount(data.dexLiveCount);
      })
      .catch(() => {
        setFeedError("Market data is not available right now. Showing sample tokens.");
      })
      .finally(() => setFeedLoading(false));
  }, []);

  const searchedTokens = useMemo(() => {
    const query = coinSearch.trim().toLowerCase();
    if (!query) return [];

    return allTokens.filter((token) =>
      [token.name, token.symbol, token.mintAddress ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [allTokens, coinSearch]);

  return (
    <div className="page">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__masthead">
            <div className="neural-hero-art neural-hero-art--masthead">
              <span className="neural-node neural-node--left" aria-hidden />
              <span className="neural-node neural-node--mid-left" aria-hidden />
              <div className="neural-hero-art__frame">
                <img
                  className="neural-brain-logo neural-brain-logo--art"
                  src="/hivemind-logo-art.png"
                  alt="HiveMind"
                />
                <p className="landing-hero__eyebrow landing-hero__eyebrow--logo-frame">The Nexus</p>
              </div>
              <span className="neural-node neural-node--mid-right" aria-hidden />
              <span className="neural-node neural-node--right" aria-hidden />
            </div>
          </div>
          <h1 className="landing-hero__headline">
            Detect risky tokens before you buy.
          </h1>
          <p className="landing-hero__subtext">
            The Nexus Sentinels scan tokens, detect risk, track whales, flag scams, and help you move before
            the crowd sees the danger.
          </p>
          <p className="landing-hero__hook">Before the rug. Before the crash.</p>
          <div className="landing-hero__actions">
            <Link to="/pulse">Try demo on Pulse</Link>
            <Link to="/pulse#nexus-pro" className="landing-hero__actions--pro">
              Nexus Pro
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-info-grid">
        <article className="landing-info-card landing-info-card--spotlight">
          <h2>One flash of intel before the candles catch up.</h2>
          <p>
            The Nexus Sentinels slam liquidity drift, whale-sized moves, violent volume, and swarm reports into a
            single hit—you feel the shift before the feed goes loud.
          </p>
        </article>
        <article className="landing-info-card">
          <h2>Detect risks. Track whales. Flag scams.</h2>
          <p>
            The Nexus routes signals through four Sentinels—Sentinel Aegis, Sentinel Pulse, Sentinel Titan, and Sentinel
            Cipher—so you get one coherent read instead of noise.
          </p>
        </article>
        <article className="landing-info-card landing-info-card--warning">
          <h2>Bad tokens move fast.</h2>
          <p>
            Scam launches, rug pulls, sudden dumps, and whale exits can hit before most traders see
            the warning. HiveMind is built to surface those signals early.
          </p>
        </article>
      </section>

      <section className="guardian-banner">
        <p className="guardian-banner__message">
          {sentinelIdle} The Nexus · Sentinels active.
        </p>
        <p className="guardian-banner__source">
          Data source: {feedSource === "live" ? "DexScreener live feed" : "Mock fallback feed"}
        </p>
        <p className="guardian-banner__source">Live pairs synced: {dexLiveCount}</p>
        {feedLoading ? (
          <p className="feed-status feed-status--loading">{getSentinelMessage("idle")}</p>
        ) : null}
        {feedError ? <p className="feed-status feed-status--error">{feedError}</p> : null}
      </section>

      <section className="coin-search-panel">
        <h2 className="token-section__title coin-search-panel__title">Token search</h2>
        <input
          id="token-search"
          className="coin-search-panel__input"
          value={coinSearch}
          onChange={(event) => setCoinSearch(event.target.value)}
          placeholder="Name, symbol, or mint"
          aria-label="Search tokens"
        />
        {coinSearch.trim() ? (
          searchedTokens.length ? (
            <ul className="token-list coin-search-panel__results">
              {searchedTokens.map((token) => (
                <li key={`search-${token.id}`}>
                  <TokenCard token={token} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="coin-search-panel__empty">
              No matching tokens in the Hive feed. Try SOL, HIVE, BONK, or PEPE.
            </p>
          )
        ) : null}
      </section>

      <section className="phantom-promo">
        <div className="phantom-promo__logo-wrap">
          <img className="phantom-promo__logo" src="/phantom-wallet.svg" alt="Phantom Wallet" />
        </div>
        <div className="phantom-promo__content">
          <p className="phantom-promo__eyebrow">Solana wallet ready</p>
          <h2>Trade with Phantom Wallet.</h2>
          <p>
            Connect your Solana flow with Phantom for buying, selling, swapping, and managing tokens
            from one trusted wallet.
          </p>
          <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer">
            Get Phantom Wallet
          </a>
        </div>
      </section>

      <section className="hive-vision">
        <div className="hive-vision__head">
          <p className="hive-vision__eyebrow">Hivemind Security Grid</p>
          <h2 className="hive-vision__title">Built to be the safest Solana trading command center.</h2>
          <p className="hive-vision__copy">
            AI risk modeling, crowd intelligence, and real-time signals from The Nexus work as one system.
          </p>
        </div>
        <div className="hive-vision__grid">
          <article className="hive-vision-card">
            <p className="hive-vision-card__icon">AI</p>
            <p className="hive-vision-card__title">AI Detection</p>
            <p className="hive-vision-card__body">
              Pattern detection scans volatility, liquidity shifts, and suspicious transaction behavior.
            </p>
          </article>
          <article className="hive-vision-card">
            <p className="hive-vision-card__icon">COM</p>
            <p className="hive-vision-card__title">Community Protection</p>
            <p className="hive-vision-card__body">
              Reports from traders feed into The Nexus scoring so risky tokens are flagged faster.
            </p>
          </article>
          <article className="hive-vision-card">
            <p className="hive-vision-card__icon">RT</p>
            <p className="hive-vision-card__title">Real-Time Alerts</p>
            <p className="hive-vision-card__body">
              Live warnings fire immediately when confidence drops or danger signals accelerate.
            </p>
          </article>
        </div>
      </section>

      <section className="token-section">
        <div className="token-section__head">
          <h2 className="token-section__title">Trending Tokens</h2>
          <p className="token-section__lede">Fast movers across the Hive feed</p>
        </div>
        <ul className="token-list">
          {trendingTokens.map((token) => (
            <li key={`trend-${token.id}`}>
              <TokenCard token={token} />
            </li>
          ))}
        </ul>
      </section>

      <section className="token-section">
        <div className="token-section__head">
          <h2 className="token-section__title">Nexus risk alerts</h2>
          <p className="token-section__lede">
            Warning and danger bands that need attention
          </p>
        </div>
        <ul className="token-list">
          {guardianAlerts.map((token) => (
            <li key={`alert-${token.id}`}>
              <TokenCard token={token} />
            </li>
          ))}
        </ul>
      </section>

      <section className="token-section">
        <div className="token-section__head">
          <h2 className="token-section__title">Verified / Safer Tokens</h2>
          <p className="token-section__lede">
            Tokens currently classified in the Nexus Safe band
          </p>
        </div>
        <ul className="token-list">
          {saferTokens.map((token) => (
            <li key={`safe-${token.id}`}>
              <TokenCard token={token} />
            </li>
          ))}
        </ul>
      </section>

      <section className="monetization-panel">
        <div className="token-section__head">
          <h2 className="token-section__title">Why HiveMind matters</h2>
          <p className="token-section__lede">
            Crypto traders need warnings before momentum turns into damage.
          </p>
        </div>

        <div className="build-goal">
          <h3>Built for faster decisions</h3>
          <p>1) Search coins before you buy.</p>
          <p>2) Read Sentinel risk signals before you chase hype.</p>
          <p>3) Upgrade to Nexus Pro when you want the full intelligence grid.</p>
        </div>
      </section>
    </div>
  );
}
