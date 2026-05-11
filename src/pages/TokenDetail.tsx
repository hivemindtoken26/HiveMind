import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TokenLogo } from "../components/TokenLogo";
import { submitHiveMindReport } from "../lib/reportSubmission";
import type { Token } from "../data/tokens";
import {
  fetchTokenDetailById,
  fetchTokenPriceHistory,
  type PriceHistoryRange,
  type PriceHistoryResult,
} from "../services/marketDataService";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1 ? 2 : 8,
  });
}

function formatChartTime(timestamp: number, range: PriceHistoryRange) {
  const date = new Date(timestamp);
  if (range === "1D") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (range === "1W") {
    return date.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function getChartGeometry(points: PriceHistoryResult["points"]) {
  const width = 1000;
  const height = 320;
  if (points.length < 2) {
    return { path: "", latestX: width, latestY: height / 2 };
  }

  const prices = points.map((point) => point.priceUsd);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const priceRange = max - min || max || 1;

  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const normalized = (point.priceUsd - min) / priceRange;
    const y = height - normalized * height;
    return { x, y };
  });
  const latest = coordinates[coordinates.length - 1];

  return {
    path: coordinates
      .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" "),
    latestX: latest.x,
    latestY: latest.y,
  };
}

const chartRanges: PriceHistoryRange[] = ["1D", "1W", "1Y"];

export function TokenDetail() {
  const { tokenId } = useParams();
  const [token, setToken] = useState<Token | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportNote, setReportNote] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<PriceHistoryRange>("1D");
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResult | null>(null);
  const [chartState, setChartState] = useState<"loading" | "ready" | "error">("loading");
  const [chartTick, setChartTick] = useState(() => Date.now());

  useEffect(() => {
    if (!tokenId) {
      setLoadState("error");
      return;
    }
    setLoadState("loading");
    fetchTokenDetailById(tokenId)
      .then((detail) => {
        setToken(detail);
        setLoadState("ready");
      })
      .catch(() => {
        setToken(null);
        setLoadState("error");
      });
  }, [tokenId]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    async function loadChart() {
      if (!token) return;
      setChartState("loading");
      try {
        const history = await fetchTokenPriceHistory(token, chartRange);
        if (cancelled) return;
        setPriceHistory(history);
        setChartState("ready");
      } catch {
        if (cancelled) return;
        setPriceHistory(null);
        setChartState("error");
      }
    }

    void loadChart();
    const intervalId = window.setInterval(() => void loadChart(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [chartRange, token]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setChartTick(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function handleReport() {
    if (!token) return;
    setReportBusy(true);
    setReportNote(null);
    const result = await submitHiveMindReport({
      tokenSymbol: token.symbol,
      tokenName: token.name,
      tokenAddress: token.mintAddress,
      details: reportDetails.trim() || undefined,
    });
    setReportBusy(false);
      if (result.ok) {
        setReportNote(
          result.channel === "supabase"
            ? "Report submitted to HiveMind."
            : "Report saved on this device.",
        );
      setReportDetails("");
    } else {
      setReportNote(result.message);
    }
  }

  if (loadState === "loading") {
    return (
      <div className="page">
        <div className="detail-loading">
          <p className="detail-loading__pulse">Loading token…</p>
        </div>
      </div>
    );
  }

  if (loadState === "error" || !token) {
    return (
      <div className="page">
        <div className="feed-status feed-status--error">
          {loadState === "error"
            ? "Could not load this token. Try again later."
            : "Token not found."}
        </div>
        <Link to="/" className="detail-back">
          Back to feed
        </Link>
      </div>
    );
  }

  const dexscreenerUrl = token.mintAddress
    ? `https://dexscreener.com/solana/${token.mintAddress}`
    : "https://dexscreener.com";
  const explorerUrl = token.mintAddress
    ? `https://solscan.io/token/${token.mintAddress}`
    : "https://solscan.io";
  const chartGeometry = priceHistory
    ? getChartGeometry(priceHistory.points)
    : { path: "", latestX: 1000, latestY: 160 };
  const chartPath = chartGeometry.path;
  const latestPoint = priceHistory?.points.at(-1);
  const firstPoint = priceHistory?.points[0];
  const latestPrice = latestPoint?.priceUsd ?? token.priceUsd;
  const firstPrice = firstPoint?.priceUsd ?? token.priceUsd;
  const chartChangePct = firstPrice ? ((latestPrice - firstPrice) / firstPrice) * 100 : 0;
  const secondsSinceUpdate = priceHistory
    ? Math.max(0, Math.floor((chartTick - priceHistory.updatedAt) / 1000))
    : 0;
  const middlePoint = priceHistory?.points[Math.floor((priceHistory?.points.length ?? 0) / 2)];
  const chartLabels =
    priceHistory && priceHistory.points.length >= 2
      ? [priceHistory.points[0], middlePoint, latestPoint]
          .filter((point): point is NonNullable<typeof point> => Boolean(point))
          .map((point) => formatChartTime(point.timestamp, priceHistory.range))
      : [];

  return (
    <div className="page">
      <section className="detail-header">
        <div className="detail-header__brand">
          <TokenLogo token={token} size="md" />
          <div className="detail-header__titles">
            <p className="detail-header__eyebrow">Token detail</p>
            <h1 className="detail-header__title">
              {token.name} ({token.symbol})
            </h1>
            <p className="detail-header__contract">
              Contract: <span>{token.mintAddress ?? "Not available"}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="detail-chart">
        <div className="detail-chart__head">
          <div>
            <h2>Live price graph</h2>
            <p>
              {priceHistory?.source === "live"
                ? `${priceHistory.intervalLabel} trading value`
                : "Preview line until live history is available"}
            </p>
          </div>
          <span>{secondsSinceUpdate}s ago</span>
        </div>
        <div className="detail-chart__toolbar" aria-label="Chart range">
          {chartRanges.map((range) => (
            <button
              type="button"
              className={chartRange === range ? "is-active" : ""}
              key={range}
              onClick={() => setChartRange(range)}
            >
              {range}
            </button>
          ))}
        </div>
        <div className="detail-chart__line-wrap">
          {chartState === "error" ? (
            <p className="detail-chart__empty">Could not load chart history.</p>
          ) : chartState === "loading" && !priceHistory ? (
            <p className="detail-chart__empty">Loading precise trading line...</p>
          ) : (
            <svg
              className="detail-chart__line"
              viewBox="0 0 1000 320"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${token.symbol} ${chartRange} price line chart`}
            >
              <defs>
                <linearGradient id="chartGlow" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#89ff2f" />
                  <stop offset="55%" stopColor="#dcffbe" />
                  <stop offset="100%" stopColor="#5ee7ff" />
                </linearGradient>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(137, 255, 47, 0.32)" />
                  <stop offset="100%" stopColor="rgba(137, 255, 47, 0)" />
                </linearGradient>
              </defs>
              <path className="detail-chart__area" d={`${chartPath} L 1000 320 L 0 320 Z`} />
              <path className="detail-chart__stroke" d={chartPath} />
              <circle
                className="detail-chart__last-dot"
                cx={chartGeometry.latestX}
                cy={chartGeometry.latestY}
                r="7"
              />
            </svg>
          )}
          <div className="detail-chart__value">
            <p>{formatUsd(latestPrice)}</p>
            <span className={chartChangePct >= 0 ? "is-up" : "is-down"}>
              {chartChangePct >= 0 ? "+" : ""}
              {chartChangePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="detail-chart__axis">
          {chartLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>

      <section className="detail-metrics">
        <article>
          <p>Price</p>
          <h3>{formatUsd(token.priceUsd)}</h3>
        </article>
        <article>
          <p>Volume</p>
          <h3>{formatUsd(token.volume24hUsd ?? 0)}</h3>
        </article>
        <article>
          <p>Liquidity</p>
          <h3>{formatUsd(token.liquidityUsd ?? 0)}</h3>
        </article>
        <article>
          <p>Market cap</p>
          <h3>{formatUsd(token.marketCapUsd ?? 0)}</h3>
        </article>
      </section>

      <section className="detail-trade-panel">
        <div>
          <h2>Trade actions</h2>
          <p>Buy, sell, or prepare staking for {token.symbol}.</p>
        </div>
        <div className="detail-trade-panel__actions">
          <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer">
            Buy {token.symbol}
          </a>
          <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer">
            Sell {token.symbol}
          </a>
          <button type="button" className="detail-trade-panel__soon" disabled>
            Coming soon
          </button>
        </div>
      </section>

      <section className="detail-guardian">
        <h2>The Nexus</h2>
        <p className="detail-guardian__lede">Sentinel intelligence for this token</p>
        <p>{token.guardianMessage}</p>
      </section>

      <section className="detail-risk">
        <h2>Risk score</h2>
        <p className="detail-risk__score">{token.riskScore ?? 50}/100</p>
        {token.confidence != null ? (
          <p className="detail-risk__confidence">Confidence: {token.confidence}%</p>
        ) : null}
        <h3>Risk reasons</h3>
        <ul>
          {(token.riskReasons ?? ["No detailed reasons yet."]).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className="detail-report-block">
        <label className="detail-report-block__label" htmlFor="report-details">
          Report suspicious token (optional note)
        </label>
        <textarea
          id="report-details"
          className="detail-report-block__textarea"
          rows={3}
          value={reportDetails}
          onChange={(e) => setReportDetails(e.target.value)}
          placeholder="Why does this look suspicious?"
        />
        <button
          type="button"
          className="detail-report"
          disabled={reportBusy}
          onClick={handleReport}
        >
          {reportBusy ? "Submitting…" : "Submit report"}
        </button>
        {reportNote ? <p className="detail-report-block__note">{reportNote}</p> : null}
      </section>

      <section className="detail-links">
        <h2>External links</h2>
        <a href={dexscreenerUrl} target="_blank" rel="noopener noreferrer">
          Open DexScreener
        </a>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
          Open Solana explorer
        </a>
      </section>

      <Link to="/" className="detail-back">
        Back to feed
      </Link>
    </div>
  );
}
