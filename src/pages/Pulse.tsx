import type { User } from "@supabase/supabase-js";
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
  upsertSignupProfile,
  upsertTrackedToken,
} from "../lib/supabaseData";
import {
  buildMotherBriefing,
  buildMotherDailyReport,
  buildSyntheticSentinels,
} from "../data/syntheticWatchers";
import { hasSupabaseEnv } from "../lib/supabaseClient";
import { getSentinelIdleMessage, getSentinelMessage } from "../lib/watcherVoice";
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

type SentinelAlertItem = {
  tokenSymbol: string;
  severity: "WARNING" | "DANGER";
  note: string;
};

type AppPlan = "FREE" | "PRO";

type PaidSignal = {
  id: string;
  title: string;
  detail: string;
};

type AuthMessage = {
  tone: "info" | "success" | "error";
  text: string;
};

const PLAN_STORAGE_KEY = "hivemind_paid_plan";
const DEMO_SESSION_KEY = "hivemind_demo_session";
const LOCAL_REPORTS_KEY = "hivemind_pending_reports";

function normalizeStoredPlan(plan: string | null | undefined): AppPlan {
  if (plan === "PRO") return "PRO";
  return "FREE";
}

function formatPlanName(plan: AppPlan) {
  if (plan === "PRO") return "Nexus Pro";
  return "Free";
}

function describeAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid_grant")) {
    return "Wrong email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }
  if (lower.includes("too many requests") || lower.includes("rate")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (lower.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("pgrst205") ||
    lower.includes("hivemind") ||
    lower.includes("undefined_table") ||
    lower.includes("42p01")
  ) {
    return "We could not reach your account right now. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}

function friendlyActionError(): string {
  return "We could not complete that action. Please try again shortly.";
}

export function Pulse() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for connection.");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<GuardianAlertItem[]>([]);
  const [tracked, setTracked] = useState<TrackedTokenItem[]>([]);
  const [sentinelAlerts, setSentinelAlerts] = useState<SentinelAlertItem[]>([]);
  const [plan, setPlan] = useState<AppPlan>(() =>
    normalizeStoredPlan(localStorage.getItem(PLAN_STORAGE_KEY)),
  );
  const [paidSignals, setPaidSignals] = useState<PaidSignal[]>([]);
  const [sentinelIdle, setSentinelIdle] = useState(getSentinelIdleMessage(Date.now()));
  const [authBusy, setAuthBusy] = useState(false);
  const [authLoadPhrase, setAuthLoadPhrase] = useState<"nexus" | "mother">("nexus");
  const [authMessage, setAuthMessage] = useState<AuthMessage>({
    tone: "info",
    text: hasSupabaseEnv
      ? "Supabase auth is ready."
      : "Add Supabase keys to enable saving watchlists and alerts to your account.",
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [motherReportStamp, setMotherReportStamp] = useState(() => Date.now());

  useEffect(() => {
    if (!authBusy) return;
    setAuthLoadPhrase("nexus");
    const id = window.setInterval(() => {
      setAuthLoadPhrase((p) => (p === "nexus" ? "mother" : "nexus"));
    }, 1400);
    return () => window.clearInterval(id);
  }, [authBusy]);

  async function refreshMarketSignals() {
    const marketFeed = await fetchMvpTokenFeed();
    const nextSentinelAlerts: SentinelAlertItem[] = marketFeed.all
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
        note: getSentinelMessage(token.guardianRisk.toLowerCase()),
      }));
    setSentinelAlerts(nextSentinelAlerts);

    const generatedSignals: PaidSignal[] = marketFeed.trending.flatMap((token, idx) => [
      {
        id: `${token.id}-entry-${idx}`,
        title: `Entry timing signal: ${token.symbol}`,
        detail: `Momentum ${token.change24hPct.toFixed(2)}% with volume confirmation from DexScreener.`,
      },
      {
        id: `${token.id}-risk-${idx}`,
        title: `Liquidity stability model: ${token.symbol}`,
        detail: `Sentinel confidence ${token.confidence ?? 70}% with liquidity tracking and risk posture.`,
      },
    ]);
    setPaidSignals(generatedSignals.slice(0, 6));
  }

  async function loadData(sessionHint?: User) {
    try {
      try {
        await refreshMarketSignals();
      } catch {
        /* Market feed optional */
      }

      let user: User | null = sessionHint ?? null;
      if (!user) {
        try {
          user = await getCurrentUser();
        } catch {
          user = null;
        }
      }
      const demoSession = localStorage.getItem(DEMO_SESSION_KEY);

      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
      } else if (demoSession) {
        setUserId(demoSession);
        setUserEmail(null);
      } else {
        setUserId(null);
        setUserEmail(null);
      }

      if (!user) return;

      const profile = await fetchProfile(user.id);
      const rawPlan =
        profile?.paid_plan === "BASIC"
          ? "FREE"
          : (profile?.paid_plan ?? localStorage.getItem(PLAN_STORAGE_KEY) ?? "FREE");
      const normalizedPlan = normalizeStoredPlan(rawPlan);
      setPlan(normalizedPlan);
      localStorage.setItem(PLAN_STORAGE_KEY, normalizedPlan);

      const watchlistRows = await fetchWatchlistTokens(user.id);
      setWatchlist(watchlistRows.map((r) => `${r.name}: ${r.token_symbol}`));

      const alertRows = await fetchGuardianAlerts();
      setAlerts(alertRows);

      const trackedRows = await fetchTrackedTokens();
      setTracked(trackedRows);
    } catch {
      /* hydration must never invalidate a successful auth */
    }
  }

  useEffect(() => {
    const demoSession = localStorage.getItem(DEMO_SESSION_KEY);
    if (demoSession) {
      setUserId(demoSession);
      setUserEmail(null);
      setStatus("Demo session active. Sign in to save watchlists and alerts.");
    }
    setSentinelIdle(getSentinelIdleMessage(Date.now()));
    if (!hasSupabaseEnv) return;
    void loadData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");
    const checkoutPlan = normalizeStoredPlan(params.get("plan"));

    if (checkoutStatus === "cancel") {
      setStatus("Checkout canceled. Your plan was not changed.");
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (checkoutStatus !== "success" || checkoutPlan !== "PRO") return;

    if (!hasSupabaseEnv) {
      setStatus("Checkout succeeded, but Supabase is not configured to remember the subscription.");
      return;
    }

    if (!userId) {
      setStatus("Checkout succeeded. Sign in so HiveMind can remember your subscription.");
      return;
    }

    if (userId.startsWith("demo-")) {
      setStatus("Checkout succeeded. Sign in with a real account to link Nexus Pro.");
      return;
    }

    updatePaidPlan(userId, "PRO")
      .then(() => {
        setPlan("PRO");
        localStorage.setItem(PLAN_STORAGE_KEY, "PRO");
        setStatus(`${formatPlanName("PRO")} saved to your HiveMind profile.`);
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch(() => {
        setStatus("Checkout succeeded, but we could not update your plan. Please contact support.");
      });
  }, [userId]);

  async function handleSignUp() {
    if (authBusy) return;
    if (!email || !password) {
      setAuthMessage({ tone: "error", text: "Enter an email and password before signing up." });
      setStatus("Enter an email and password first.");
      return;
    }
    try {
      setAuthBusy(true);
      setAuthMessage({ tone: "info", text: "Connecting to Nexus..." });
      if (!hasSupabaseEnv) {
        const demoId = `demo-${Date.now()}`;
        localStorage.setItem(DEMO_SESSION_KEY, demoId);
        setUserId(demoId);
        setUserEmail(null);
        const message =
          "Demo session started. Add Supabase keys on the server to create a real account.";
        setAuthMessage({ tone: "success", text: message });
        setStatus(message);
        return;
      }
      const result = await signUpWithEmail(email, password);
      localStorage.removeItem(DEMO_SESSION_KEY);
      const signupUser = result.session?.user ?? result.user ?? null;
      setUserId(signupUser?.id ?? null);
      setUserEmail(signupUser?.email ?? email);
      const signupEmail = signupUser?.email ?? email;
      if (result.session && signupUser && signupEmail) {
        try {
          await upsertSignupProfile(signupUser.id, signupEmail, "");
        } catch {
          /* profile row may already exist */
        }
      }
      const message = result.session
        ? "Welcome to the Nexus. You are signed in."
        : "Check your inbox to confirm your email, then sign in.";
      setAuthMessage({ tone: "success", text: message });
      setStatus(message);
      if (result.session && signupUser) {
        void loadData(signupUser);
      } else {
        void refreshMarketSignals();
      }
    } catch (err) {
      const friendlyMessage =
        (err as Error).message?.toLowerCase().includes("rate")
          ? "Too many sign-up attempts. Please wait a minute before trying again."
          : describeAuthError(err);
      setAuthMessage({ tone: "error", text: friendlyMessage });
      setStatus(friendlyMessage);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignIn() {
    if (authBusy) return;
    if (!email || !password) {
      setAuthMessage({ tone: "error", text: "Enter an email and password before signing in." });
      setStatus("Enter an email and password first.");
      return;
    }
    try {
      setAuthBusy(true);
      setAuthMessage({ tone: "info", text: "Connecting to Nexus..." });
      if (!hasSupabaseEnv) {
        const demoId = localStorage.getItem(DEMO_SESSION_KEY) ?? `demo-${Date.now()}`;
        localStorage.setItem(DEMO_SESSION_KEY, demoId);
        setUserId(demoId);
        setUserEmail(null);
        const message =
          "Demo session active. Add Supabase keys to sign in with email and password.";
        setAuthMessage({ tone: "success", text: message });
        setStatus(message);
        return;
      }
      const result = await signInWithEmail(email, password);
      localStorage.removeItem(DEMO_SESSION_KEY);
      const signedIn = result.session?.user ?? result.user ?? null;
      if (!signedIn) {
        setAuthMessage({
          tone: "error",
          text: "Sign-in did not finish. Confirm your email or reset your password.",
        });
        setStatus("Sign-in incomplete. Check your email for a confirmation link.");
        return;
      }
      setUserId(signedIn.id);
      setUserEmail(signedIn.email ?? email);
      const message = signedIn.email
        ? `Synchronized as ${signedIn.email}.`
        : "Synchronized with Nexus.";
      setAuthMessage({ tone: "success", text: message });
      setStatus(message);
      void loadData(signedIn);
    } catch (err) {
      const message = describeAuthError(err);
      setAuthMessage({ tone: "error", text: message });
      setStatus(message);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleDemoMode() {
    const demoId = localStorage.getItem(DEMO_SESSION_KEY) ?? `demo-${Date.now()}`;
    localStorage.setItem(DEMO_SESSION_KEY, demoId);
    setUserId(demoId);
    setUserEmail(null);
    setAuthMessage({ tone: "success", text: "Demo mode is live. Explore freely; sign in to save." });
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
    setStatus("Demo mode: sample intelligence loaded. Sign in to persist watchlists and alerts.");
  }

  async function handleSeedData() {
    if (!userId) {
      setStatus("Sign in to save a watchlist, reports, and tracked tokens.");
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
      setStatus("Sample watchlist and alerts shown in demo. Sign in with Supabase to save.");
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
    } catch {
      setStatus(friendlyActionError());
    }
  }

  async function handleSignOut() {
    if (!userId) {
      setAuthMessage({ tone: "error", text: "No active session to sign out." });
      setStatus("No active session to sign out.");
      return;
    }
    if (!hasSupabaseEnv || userId.startsWith("demo-")) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      setUserId(null);
      setUserEmail(null);
      setWatchlist([]);
      setAlerts([]);
      setTracked([]);
      setAuthMessage({ tone: "success", text: "Signed out of demo mode." });
      setStatus("Signed out of demo mode.");
      return;
    }
    try {
      await signOut();
      localStorage.removeItem(DEMO_SESSION_KEY);
      setUserId(null);
      setUserEmail(null);
      setWatchlist([]);
      setAlerts([]);
      setTracked([]);
      setAuthMessage({ tone: "success", text: "Signed out." });
      setStatus("Signed out.");
    } catch {
      setAuthMessage({ tone: "error", text: "We could not sign you out. Please try again." });
      setStatus(friendlyActionError());
    }
  }

  async function handleUpgradeTrigger() {
    if (checkoutBusy) return;
    if (!hasSupabaseEnv || !userId || userId.startsWith("demo-")) {
      setStatus("Sign in with Supabase before upgrading so Nexus Pro links to your account.");
      return;
    }
    try {
      setCheckoutBusy(true);
      setStatus("Opening secure checkout…");
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "PRO",
          userId,
          email: userEmail ?? (email || undefined),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "unavailable");
      }
      window.location.href = data.url;
    } catch {
      setStatus("Checkout is not available right now. Please try again later.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  function handleMotherReport() {
    setMotherReportStamp(Date.now());
    setStatus("Mother compiled a fresh Nexus oversight brief.");
  }

  const warningCalls = tracked.filter((token) => token.guardian_status === "WARNING");
  const safeCalls = tracked.filter((token) => token.guardian_status === "SAFE");
  const dangerAlerts = alerts.filter((alert) => alert.severity?.toUpperCase() === "DANGER");
  const visibleSignals = paidSignals.map((signal) => ({
    ...signal,
    isLocked: plan !== "PRO",
  }));

  const sentinelSignals = useMemo(() => {
    let reportCount = 0;
    try {
      const localReports = localStorage.getItem(LOCAL_REPORTS_KEY);
      reportCount = localReports ? (JSON.parse(localReports) as unknown[]).length : 0;
    } catch {
      reportCount = 0;
    }

    return {
      watchlistCount: watchlist.length,
      alertCount: alerts.length + sentinelAlerts.length,
      trackedCount: tracked.length,
      reportCount,
      plan,
    };
  }, [alerts.length, plan, tracked.length, sentinelAlerts.length, watchlist.length]);

  const syntheticSentinels = useMemo(
    () => buildSyntheticSentinels(sentinelSignals),
    [sentinelSignals],
  );
  const motherBriefing = useMemo(
    () => buildMotherBriefing(syntheticSentinels, sentinelSignals),
    [syntheticSentinels, sentinelSignals],
  );
  const motherDailyReport = useMemo(
    () => buildMotherDailyReport(syntheticSentinels, sentinelSignals),
    [motherReportStamp, syntheticSentinels, sentinelSignals],
  );

  const authBusyLabel =
    authLoadPhrase === "nexus" ? "Connecting to Nexus..." : "Mother synchronizing...";

  return (
    <div className="page">
      <section className="page__intro">
        <h1 className="page__headline">Pulse</h1>
        <p className="page__lede">
          Nexus command center: Sentinel warnings, safe calls, and live alerts.
        </p>
      </section>

      <div className="pulse-status-banner">
        <p className="pulse-status-banner__label">Status</p>
        <p className="pulse-status-banner__message">{status}</p>
        {!hasSupabaseEnv ? (
          <p className="pulse-status-banner__hint">
            Demo mode works without signup. Add Supabase and Stripe environment variables for live
            accounts and Nexus Pro.
          </p>
        ) : null}
      </div>

      <section className="neo-command">
        <div className="neo-command__head">
          <img className="neo-command__logo" src="/hivemind-logo.svg" alt="" aria-hidden />
          <div>
            <p className="neo-command__eyebrow">MOTHER · NEXUS OVERSEER</p>
            <h2>Mother coordinates the Sentinels.</h2>
          </div>
        </div>
        <p className="neo-command__briefing">{motherBriefing}</p>
        <p className="neo-command__copy">
          Mother audits Morpheus, Warden, Surge, Oracle, and Whale Sentinel so each lane learns from
          reports, alerts, watchlists, and hive memory over time.
        </p>
        <div className="neo-report">
          <div className="neo-report__metrics">
            <span>Mood: {motherDailyReport.mood}</span>
            <span>Health: {motherDailyReport.systemHealth}%</span>
            <span>Grade: {motherDailyReport.oversightGrade}</span>
          </div>
          <h3>{motherDailyReport.headline}</h3>
          <p>{motherDailyReport.daySummary}</p>
          <ul>
            {motherDailyReport.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ul>
          <p className="neo-report__closing">{motherDailyReport.closingNote}</p>
          <button className="neo-report__button" type="button" onClick={handleMotherReport}>
            Ask Mother for a fresh brief
          </button>
        </div>
      </section>

      <section className="watcher-grid-panel">
        <div className="token-section__head">
          <h2 className="token-section__title">Nexus Sentinels</h2>
          <p className="token-section__lede">Ranks, XP, confidence, and learning memory</p>
        </div>
        <div className="synthetic-watchers">
          {syntheticSentinels.map((sentinel) => {
            const progress =
              sentinel.level >= 5
                ? 100
                : Math.min(100, Math.round((sentinel.xp / sentinel.nextLevelXp) * 100));
            return (
              <article
                className={`synthetic-watcher synthetic-watcher--${sentinel.accent}`}
                key={sentinel.id}
              >
                <div className="synthetic-watcher__top">
                  <div>
                    <p className="synthetic-watcher__name">{sentinel.name}</p>
                    <p className="synthetic-watcher__role">{sentinel.role}</p>
                  </div>
                  <span className="synthetic-watcher__level">
                    Lv {sentinel.level} {sentinel.levelName}
                  </span>
                </div>
                <div className="synthetic-watcher__meter">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className="synthetic-watcher__status">{sentinel.status}</p>
                <p className="synthetic-watcher__lesson">{sentinel.lesson}</p>
                <p className="synthetic-watcher__confidence">
                  Confidence: {sentinel.confidence}% · XP: {sentinel.xp}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="pulse-card">
        <p className="pulse-card__title">Enter the Nexus</p>
        <p className="pulse-card__subtitle pulse-card__subtitle--premium">Mother awaiting synchronization.</p>
        <div className="pulse-form">
          <button className="pulse-demo-button pulse-demo-button--first" onClick={handleDemoMode} type="button">
            Launch demo mode first
          </button>
          <p className={`pulse-auth-message pulse-auth-message--${authMessage.tone}`} role="status">
            {authMessage.text}
          </p>
          {authBusy ? (
            <p className="pulse-nexus-loading" role="status">
              {authBusyLabel}
            </p>
          ) : null}
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
            <button onClick={handleSignOut} type="button" disabled={authBusy}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Saved data</p>
        <p className="pulse-card__body pulse-card__body--muted">
          Sign in with Supabase to persist watchlists, community reports, and tracked tokens.
        </p>
        <button onClick={handleSeedData} type="button">
          Seed watchlist / report / tracked token
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
                <strong>Sentinel: WARNING</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">{sentinelIdle}</p>
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
          <p className="pulse-card__body">{getSentinelMessage("safe")}</p>
        )}
      </div>

      <div className="pulse-card">
        <p className="pulse-card__title">Sentinel alerts (live feed)</p>
        {sentinelAlerts.length ? (
          <ul className="pulse-list">
            {sentinelAlerts.map((alert) => (
              <li key={`sentinel-alert-${alert.tokenSymbol}-${alert.severity}`}>
                <span>
                  {alert.tokenSymbol} - {alert.note}
                </span>
                <strong>{alert.severity}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">{getSentinelMessage("safe")}</p>
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
          <p className="pulse-card__body">No active alerts. Sentinels are scanning.</p>
        )}
        {dangerAlerts.length ? (
          <p className="pulse-card__body pulse-card__body--danger">
            {dangerAlerts.length} high-risk alert{dangerAlerts.length > 1 ? "s are" : " is"} active.
          </p>
        ) : null}
      </div>

      <div className="pulse-card" id="nexus-pro">
        <p className="pulse-card__title">Nexus Pro</p>
        <div className="pulse-tier-grid pulse-tier-grid--single">
          <article className="pulse-tier-card pulse-tier-card--pro pulse-tier-card--solo">
            <p className="pulse-tier-card__badge">Included</p>
            <p className="pulse-tier-card__name">Nexus Pro</p>
            <p className="pulse-tier-card__price">$19.99/mo</p>
            <p className="pulse-tier-card__summary">
              Full Sentinel intelligence, priority live signals, and deeper risk context across the hive.
            </p>
          </article>
        </div>
        <div className="pulse-actions pulse-actions--tiers">
          {plan !== "PRO" ? (
            <button
              type="button"
              className="pulse-button--pro"
              disabled={checkoutBusy}
              onClick={() => void handleUpgradeTrigger()}
            >
              {checkoutBusy ? "Opening…" : "Upgrade to Nexus Pro — $19.99/month"}
            </button>
          ) : (
            <p className="pulse-card__body">Nexus Pro is active on your account.</p>
          )}
        </div>
        <p className="pulse-card__body">Current plan: {formatPlanName(plan)}</p>
        {visibleSignals.length ? (
          <ul className="pulse-list">
            {visibleSignals.map((signal) => (
              <li key={signal.id}>
                <span>
                  {signal.title} — {signal.detail}
                </span>
                {signal.isLocked ? (
                  <strong>Included in Nexus Pro</strong>
                ) : (
                  <strong>Unlocked</strong>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-card__body">Sentinels are scanning for Nexus Pro signal candidates.</p>
        )}
      </div>
    </div>
  );
}
