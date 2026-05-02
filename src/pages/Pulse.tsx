import { useEffect, useMemo, useState } from "react";
import {
  addWatchlistToken,
  createWatchlist,
  fetchGuardianAlerts,
  fetchProfile,
  fetchTrackedTokens,
  fetchWatchlistTokens,
  getCurrentUser,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  submitTokenReport,
  updatePaidPlan,
  upsertProfile,
  upsertTrackedToken,
} from "../lib/supabaseData";
import {
  buildNeoBriefing,
  buildNeoDailyReport,
  buildSyntheticWatchers,
} from "../data/syntheticWatchers";
import { hasSupabaseEnv } from "../lib/supabaseClient";
import { getWatcherIdleMessage, getWatcherMessage } from "../lib/watcherVoice";
import { fetchMvpTokenFeed } from "../services/marketDataService";

type GuardianAlertItem = {
  token_symbol?: string | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
};

type TrackedTokenItem = {
  token_symbol?: string | null;
  token_name?: string | null;
  guardian_status?: "SAFE" | "WARNING" | "DANGER" | null;
  guardian_score?: number | null;
};

type WatcherAlertItem = {
  tokenSymbol: string;
  severity: "WARNING" | "DANGER";
  note: string;
};

type PaidPlan = "BASIC" | "PRO";
type AppPlan = "FREE" | PaidPlan;

type PaidSignal = {
  id: string;
  tier: PaidPlan;
  title: string;
  detail: string;
};

const PLAN_STORAGE_KEY = "hivemind_paid_plan";
const DEMO_SESSION_KEY = "hivemind_demo_session";
const LOCAL_REPORTS_KEY = "hivemind_pending_reports";
const TIER_DEFINITIONS = {
  FREE: {
    price: "$0",
    summary: "Starter tokens and basic Watcher messages.",
  },
  BASIC: {
    price: "$9.99/mo",
    summary: "Better insights, more alerts, and faster updates.",
  },
  PRO: {
    price: "$29.99/mo",
    summary: "Early signals, high-risk warnings, and priority feeds.",
  },
} as const;

function normalizeStoredPlan(plan: string | null | undefined): AppPlan {
  if (plan === "BASIC") return "BASIC";
  if (plan === "PRO") return "PRO";
  return "FREE";
}

function formatPlanName(plan: AppPlan | PaidPlan) {
  if (plan === "FREE") return "Free";
  if (plan === "BASIC") return "Basic";
  return "Pro";
}

export function Pulse() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for connection.");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<GuardianAlertItem[]>([]);
  const [tracked, setTracked] = useState<TrackedTokenItem[]>([]);
  const [watcherAlerts, setWatcherAlerts] = useState<WatcherAlertItem[]>([]);
  const [plan, setPlan] = useState<AppPlan>(() =>
    normalizeStoredPlan(localStorage.getItem(PLAN_STORAGE_KEY)),
  );
  const [paidSignals, setPaidSignals] = useState<PaidSignal[]>([]);
  const [watcherIdle, setWatcherIdle] = useState(getWatcherIdleMessage(Date.now()));
  const [authBusy, setAuthBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [neoReportStamp, setNeoReportStamp] = useState(() => Date.now());

  async function loadData() {
    const marketFeed = await fetchMvpTokenFeed();
    const marketAlerts: WatcherAlertItem[] = marketFeed.all
      .filter(
        (token) =>
          token.guardianRisk !== "SAFE" ||
          (token.change24hPct != null && Math.abs(token.change24hPct) >= 12) ||
          (token.liquidityUsd != null && token.liquidityUsd <= 50_000),
      )
      .slice(0, 6)
      .map((token) => ({
        tokenSymbol: token.symbol,
        severity: token.guardianRisk === "DANGER" ? "DANGER" : "WARNING",
        note: getWatcherMessage(token.guardianRisk.toLowerCase()),
      }));
    setWatcherAlerts(marketAlerts);

    const generatedSignals: PaidSignal[] = marketFeed.trending.flatMap((token, idx) => [
      {
        id: `${token.id}-entry`,
        tier: "BASIC",
        title: `Entry timing signal: ${token.symbol}`,
        detail: `Momentum ${token.change24hPct.toFixed(2)}% with volume confirmation from DexScreener.`,
      },
      {
        id: `${token.id}-risk`,
        tier: idx === 0 ? "PRO" : "BASIC",
        title: `Liquidity stability model: ${token.symbol}`,
        detail: `Watcher confidence ${token.confidence ?? 70}% with liquidity tracking and risk posture.`,
      },
    ]);
    setPaidSignals(generatedSignals.slice(0, 6));

    const user = await getCurrentUser();
    setUserId(user?.id ?? null);
    if (!user) return;

    const profile = await fetchProfile(user.id);
    setDisplayName(profile?.display_name ?? "");
    setUsername(profile?.username ?? "");
    const persistedPlan = profile?.paid_plan ?? localStorage.getItem(PLAN_STORAGE_KEY) ?? "FREE";
    const normalizedPlan = normalizeStoredPlan(persistedPlan);
    setPlan(normalizedPlan);
    localStorage.setItem(PLAN_STORAGE_KEY, normalizedPlan);

    const watchlistRows = await fetchWatchlistTokens(user.id);
    setWatchlist(watchlistRows.map((r) => `${r.name}: ${r.token_symbol}`));

    const alertRows = await fetchGuardianAlerts();
    setAlerts(alertRows);

    const trackedRows = await fetchTrackedTokens();
    setTracked(trackedRows);
  }

  useEffect(() => {
    const demoSession = localStorage.getItem(DEMO_SESSION_KEY);
    if (demoSession) {
      setUserId(demoSession);
      setStatus("Demo session active. Connect Supabase for real accounts.");
    }
    setWatcherIdle(getWatcherIdleMessage(Date.now()));
    if (!hasSupabaseEnv) return;
    loadData().catch((err: Error) => setStatus(err.message));
  }, []);

  async function handleSignUp() {
    if (authBusy) return;
    if (!email || !password) {
      setStatus("Enter an email and password first.");
      return;
    }
    try {
      setAuthBusy(true);
      if (!hasSupabaseEnv) {
        const demoId = `demo-${Date.now()}`;
        localStorage.setItem(DEMO_SESSION_KEY, demoId);
        setUserId(demoId);
        setStatus("Demo account started locally. Add Supabase env vars for real sign up.");
        return;
      }
      await signUpWithEmail(email, password);
      setStatus("Sign-up request sent. Check your inbox for confirmation.");
      await loadData();
    } catch (err) {
      const message = (err as Error).message;
      setStatus(
        message.toLowerCase().includes("rate")
          ? "Too many sign-up attempts. Please wait a minute before trying again."
          : message,
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignIn() {
    if (authBusy) return;
    if (!email || !password) {
      setStatus("Enter an email and password first.");
      return;
    }
    try {
      setAuthBusy(true);
      if (!hasSupabaseEnv) {
        const demoId = localStorage.getItem(DEMO_SESSION_KEY) ?? `demo-${Date.now()}`;
        localStorage.setItem(DEMO_SESSION_KEY, demoId);
        setUserId(demoId);
        setStatus("Signed in locally for demo mode. Add Supabase env vars for real auth.");
        return;
      }
      await signInWithEmail(email, password);
      setStatus("Signed in.");
      await loadData();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleDemoMode() {
    const demoId = localStorage.getItem(DEMO_SESSION_KEY) ?? `demo-${Date.now()}`;
    localStorage.setItem(DEMO_SESSION_KEY, demoId);
    setUserId(demoId);
    setDisplayName(displayName || "HiveMind Demo");
    setUsername(username || "demo_watcher");
    setWatchlist(["Guardian Watchlist: HIVE"]);
    setTracked([
      {
        token_symbol: "HIVE",
        token_name: "HiveMind",
        guardian_status: "WARNING",
        guardian_score: 63,
      },
      {
        token_symbol: "SOL",
        token_name: "Solana",
        guardian_status: "SAFE",
        guardian_score: 82,
      },
    ]);
    setAlerts([
      {
        token_symbol: "SCAM",
        severity: "DANGER",
        title: "Demo scam report",
        message: "Suspicious liquidity movement.",
      },
    ]);
    setStatus("Demo mode launched. Buttons are active locally while live services are configured.");
  }

  async function handleProfileSave() {
    if (!userId) {
      setStatus("Sign in before saving your profile.");
      return;
    }
    if (!hasSupabaseEnv || userId.startsWith("demo-")) {
      setStatus("Profile saved locally for demo mode.");
      return;
    }
    try {
      await upsertProfile(userId, displayName, username);
      setStatus("Profile saved.");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function handleSeedData() {
    if (!userId) {
      setStatus("Sign in before writing watchlist or report data.");
      return;
    }
    if (!hasSupabaseEnv || userId.startsWith("demo-")) {
      setWatchlist(["Guardian Watchlist: HIVE"]);
      setTracked([
        {
          token_symbol: "HIVE",
          token_name: "HiveMind",
          guardian_status: "WARNING",
          guardian_score: 63,
        },
      ]);
      setAlerts([
        {
          token_symbol: "SCAM",
          severity: "DANGER",
          title: "Demo scam report",
          message: "Suspicious liquidity movement.",
        },
      ]);
      setStatus("Demo watchlist, report, and tracked token data added locally.");
      return;
    }
    try {
      const watchlistId = await createWatchlist(userId, "Guardian Watchlist");
      await addWatchlistToken(
        watchlistId,
        "HIVE",
        "HiveMind",
        "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
      );
      await submitTokenReport(
        userId,
        "SCAM",
        "ScamMoon",
        "Community report: suspicious liquidity movement.",
      );
      await upsertTrackedToken({
        tokenSymbol: "HIVE",
        tokenName: "HiveMind",
        tokenAddress: "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
        chain: "solana",
        price: 0.00432,
        volume24h: 482364,
        liquidity: 1285730,
        marketCap: 43198122,
        guardianScore: 63,
        guardianStatus: "WARNING",
      });
      setStatus("Watchlist, report, and tracked token records written.");
      await loadData();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function handleSignOut() {
    if (!userId) {
      setStatus("No active session to sign out.");
      return;
    }
    if (!hasSupabaseEnv || userId.startsWith("demo-")) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      setUserId(null);
      setWatchlist([]);
      setAlerts([]);
      setTracked([]);
      setStatus("Signed out of demo mode.");
      return;
    }
    try {
      await signOut();
      setUserId(null);
      setWatchlist([]);
      setAlerts([]);
      setTracked([]);
      setStatus("Signed out.");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function handlePlanChange(nextPlan: AppPlan) {
    setPlan(nextPlan);
    localStorage.setItem(PLAN_STORAGE_KEY, nextPlan);
    if (!userId || userId.startsWith("demo-")) {
      setStatus(`${formatPlanName(nextPlan)} plan enabled locally. Connect Stripe/Supabase for paid accounts.`);
      return;
    }
    try {
      await updatePaidPlan(userId, nextPlan);
      setStatus(`Plan updated to ${formatPlanName(nextPlan)}.`);
    } catch (err) {
      setStatus(
        `Plan saved locally. Supabase sync pending: ${(err as Error).message}`,
      );
    }
  }

  async function handleUpgradeTrigger(targetPlan: PaidPlan) {
    if (checkoutBusy) return;
    try {
      setCheckoutBusy(true);
      if (!email && !userId) {
        await handlePlanChange(targetPlan);
        setStatus(`Demo ${formatPlanName(targetPlan)} plan enabled locally. Add Stripe env vars for checkout.`);
        return;
      }
      setStatus(`Opening Stripe checkout for ${formatPlanName(targetPlan)}...`);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: targetPlan,
          userId,
          email: email || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        await handlePlanChange(targetPlan);
        throw new Error(
          `${data.error ?? "Checkout is not configured yet."} Demo ${formatPlanName(targetPlan)} plan was enabled locally.`,
        );
      }
      window.location.assign(data.url);
    } catch (err) {
      setStatus(`Upgrade failed: ${(err as Error).message}`);
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleTierButtonClick(targetPlan: AppPlan) {
    if (targetPlan === "FREE") {
      await handlePlanChange("FREE");
      return;
    }
    await handleUpgradeTrigger(targetPlan);
  }

  function handleNeoReport() {
    setNeoReportStamp(Date.now());
    setStatus("NEO generated a fresh oversight report for the hive.");
  }

  const warningCalls = tracked.filter((token) => token.guardian_status === "WARNING");
  const safeCalls = tracked.filter((token) => token.guardian_status === "SAFE");
  const dangerAlerts = alerts.filter((alert) => alert.severity?.toUpperCase() === "DANGER");
  const visibleSignals = paidSignals.map((signal) => {
    const isLocked =
      (signal.tier === "BASIC" && plan === "FREE") ||
      (signal.tier === "PRO" && plan !== "PRO");
    return { ...signal, isLocked };
  });
  const watcherSignals = useMemo(() => {
    let reportCount = 0;
    try {
      const localReports = localStorage.getItem(LOCAL_REPORTS_KEY);
      reportCount = localReports ? (JSON.parse(localReports) as unknown[]).length : 0;
    } catch {
      reportCount = 0;
    }

    return {
      watchlistCount: watchlist.length,
      alertCount: alerts.length + watcherAlerts.length,
      trackedCount: tracked.length,
      reportCount,
      plan,
    };
  }, [alerts.length, plan, tracked.length, watcherAlerts.length, watchlist.length]);
  const syntheticWatchers = useMemo(
    () => buildSyntheticWatchers(watcherSignals),
    [watcherSignals],
  );
  const neoBriefing = useMemo(
    () => buildNeoBriefing(syntheticWatchers, watcherSignals),
    [syntheticWatchers, watcherSignals],
  );
  const neoDailyReport = useMemo(
    () => buildNeoDailyReport(syntheticWatchers, watcherSignals),
    [neoReportStamp, syntheticWatchers, watcherSignals],
  );

  return (
    <div className="page">
      <section className="page__intro">
        <h1 className="page__headline">Pulse</h1>
        <p className="page__lede">
          Watcher command center with live warnings, safe calls, and active alerts.
        </p>
      </section>

      <div className="pulse-status-banner">
        <p className="pulse-status-banner__label">Action status</p>
        <p className="pulse-status-banner__message">{status}</p>
        {!hasSupabaseEnv ? (
          <p className="pulse-status-banner__hint">
            Demo mode is active. Add Supabase and Stripe env vars in Vercel for real accounts and payments.
          </p>
        ) : null}
      </div>

      <section className="neo-command">
        <div className="neo-command__head">
          <img className="neo-command__logo" src="/hivemind-logo.svg" alt="" aria-hidden />
          <div>
            <p className="neo-command__eyebrow">NEO OVERSEER ONLINE</p>
            <h2>NEO watches the Watchers.</h2>
          </div>
        </div>
        <p className="neo-command__briefing">{neoBriefing}</p>
        <p className="neo-command__copy">
          NEO audits Scout, Sentinel, Oracle, and Warden so each Guardian learns from reports,
          alerts, watchlists, and mistakes over time.
        </p>
        <div className="neo-report">
          <div className="neo-report__metrics">
            <span>Mood: {neoDailyReport.mood}</span>
            <span>Health: {neoDailyReport.systemHealth}%</span>
            <span>Grade: {neoDailyReport.oversightGrade}</span>
          </div>
          <h3>{neoDailyReport.headline}</h3>
          <p>{neoDailyReport.daySummary}</p>
          <ul>
            {neoDailyReport.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ul>
          <p className="neo-report__closing">{neoDailyReport.closingNote}</p>
          <button className="neo-report__button" type="button" onClick={handleNeoReport}>
            Ask NEO for report
          </button>
        </div>
      </section>

      <section className="watcher-grid-panel">
        <div className="token-section__head">
          <h2 className="token-section__title">Synthetic Watchers</h2>
          <p className="token-section__lede">Levels, XP, confidence, and learning memory</p>
        </div>
        <div className="synthetic-watchers">
          {syntheticWatchers.map((watcher) => {
            const progress =
              watcher.level >= 5
                ? 100
                : Math.min(100, Math.round((watcher.xp / watcher.nextLevelXp) * 100));
            return (
              <article
                className={`synthetic-watcher synthetic-watcher--${watcher.accent}`}
                key={watcher.id}
              >
                <div className="synthetic-watcher__top">
                  <div>
                    <p className="synthetic-watcher__name">{watcher.name}</p>
                    <p className="synthetic-watcher__role">{watcher.role}</p>
                  </div>
                  <span className="synthetic-watcher__level">
                    Lv {watcher.level} {watcher.levelName}
                  </span>
                </div>
                <div className="synthetic-watcher__meter">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className="synthetic-watcher__status">{watcher.status}</p>
                <p className="synthetic-watcher__lesson">{watcher.lesson}</p>
                <p className="synthetic-watcher__confidence">
                  Confidence: {watcher.confidence}% · XP: {watcher.xp}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="pulse-card">
        <p className="pulse-card__title">Auth</p>
        <div className="pulse-form">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <div className="pulse-actions">
            <button onClick={handleSignUp} type="button" disabled={authBusy}>
              {authBusy ? "Working..." : "Sign up"}
            </button>
            <button onClick={handleSignIn} type="button" disabled={authBusy}>
              {authBusy ? "Working..." : "Sign in"}
            </button>
            <button onClick={handleSignOut} type="button">
              Sign out
            </button>
          </div>
          <button className="pulse-demo-button" onClick={handleDemoMode} type="button">
            Launch demo mode
          </button>
        </div>
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Profile</p>
        <div className="pulse-form">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
          />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <button onClick={handleProfileSave} type="button">
            Save profile
          </button>
        </div>
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Data actions</p>
        <button onClick={handleSeedData} type="button">
          Write watchlist/report/tracked token
        </button>
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Saved watchlist tokens</p>
        <p className="pulse-card__body">{watchlist.length ? watchlist.join(" · ") : "None yet."}</p>
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Warnings</p>
        {warningCalls.length ? (
          <ul className="pulse-list">
            {warningCalls.map((token) => (
              <li key={`warning-${token.token_symbol}`}>
                <span>{token.token_symbol ?? "UNKNOWN"}</span>
                <strong>Watcher: WARNING</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">{watcherIdle}</p>
        )}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Safe calls</p>
        {safeCalls.length ? (
          <ul className="pulse-list">
            {safeCalls.map((token) => (
              <li key={`safe-${token.token_symbol}`}>
                <span>{token.token_symbol ?? "UNKNOWN"}</span>
                <strong>
                  Guardian: SAFE
                  {typeof token.guardian_score === "number"
                    ? ` (${token.guardian_score}/100)`
                    : ""}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">{getWatcherMessage("safe")}</p>
        )}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Watcher alerts (live feed)</p>
        {watcherAlerts.length ? (
          <ul className="pulse-list">
            {watcherAlerts.map((alert) => (
              <li key={`watcher-alert-${alert.tokenSymbol}-${alert.severity}`}>
                <span>
                  {alert.tokenSymbol} - {alert.note}
                </span>
                <strong>{alert.severity}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">{getWatcherMessage("safe")}</p>
        )}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Live alerts</p>
        {alerts.length ? (
          <ul className="pulse-list">
            {alerts.map((alert, index) => (
              <li key={`alert-${alert.token_symbol ?? "token"}-${index}`}>
                <span>
                  {alert.token_symbol ?? "Unknown token"} - {alert.title ?? "Untitled alert"}
                </span>
                <strong>{alert.severity ?? "UNKNOWN"}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">The Watcher is observing. No active alerts.</p>
        )}
        {dangerAlerts.length ? (
          <p className="pulse-card__body pulse-card__body--danger">
            {dangerAlerts.length} high-risk alert{dangerAlerts.length > 1 ? "s are" : " is"} active.
          </p>
        ) : null}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Plans and paid signals</p>
        <div className="pulse-tier-grid pulse-tier-grid--futuristic">
          <article className="pulse-tier-card pulse-tier-card--free">
            <p className="pulse-tier-card__name">Free</p>
            <p className="pulse-tier-card__price">{TIER_DEFINITIONS.FREE.price}</p>
            <p className="pulse-tier-card__summary">{TIER_DEFINITIONS.FREE.summary}</p>
          </article>
          <article className="pulse-tier-card pulse-tier-card--basic">
            <p className="pulse-tier-card__badge">Popular</p>
            <p className="pulse-tier-card__name">Basic</p>
            <p className="pulse-tier-card__price">{TIER_DEFINITIONS.BASIC.price}</p>
            <p className="pulse-tier-card__summary">{TIER_DEFINITIONS.BASIC.summary}</p>
          </article>
          <article className="pulse-tier-card pulse-tier-card--pro">
            <p className="pulse-tier-card__badge">Elite</p>
            <p className="pulse-tier-card__name">Pro</p>
            <p className="pulse-tier-card__price">{TIER_DEFINITIONS.PRO.price}</p>
            <p className="pulse-tier-card__summary">{TIER_DEFINITIONS.PRO.summary}</p>
          </article>
        </div>
        <div className="pulse-actions pulse-actions--tiers">
          <button
            type="button"
            className={plan === "FREE" ? "is-active-tier" : ""}
            onClick={() => void handleTierButtonClick("FREE")}
          >
            {plan === "FREE" ? "Free active" : "Switch to Free"}
          </button>
          <button
            type="button"
            className={plan === "BASIC" ? "is-active-tier" : "pulse-button--basic"}
            disabled={checkoutBusy}
            onClick={() => void handleTierButtonClick("BASIC")}
          >
            {plan === "BASIC" ? "Basic active" : "Upgrade to Basic"}
          </button>
          <button
            type="button"
            className={plan === "PRO" ? "is-active-tier" : "pulse-button--pro"}
            disabled={checkoutBusy}
            onClick={() => void handleTierButtonClick("PRO")}
          >
            {plan === "PRO" ? "Pro active" : "Upgrade to Pro"}
          </button>
        </div>
        <p className="pulse-card__body">Current plan: {formatPlanName(plan)}</p>
        <button
          type="button"
          className="pulse-checkout"
          disabled={checkoutBusy}
          onClick={() => handleUpgradeTrigger(plan === "FREE" ? "BASIC" : "PRO")}
        >
          {checkoutBusy ? "Opening Stripe..." : "Upgrade now with Stripe"}
        </button>
        {visibleSignals.length ? (
          <ul className="pulse-list">
            {visibleSignals.map((signal) => (
              <li key={signal.id}>
                <span>
                  {signal.title} - {signal.detail}
                </span>
                {signal.isLocked ? (
                  <button
                    type="button"
                    disabled={checkoutBusy}
                    onClick={() => handleUpgradeTrigger(signal.tier)}
                  >
                    {checkoutBusy ? "Opening..." : `Unlock ${formatPlanName(signal.tier)}`}
                  </button>
                ) : (
                  <strong>{formatPlanName(signal.tier)} unlocked</strong>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">The Watcher is observing paid signal candidates.</p>
        )}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Status</p>
        <p className="pulse-card__body">{status}</p>
      </div>
    </div>
  );
}
