import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { nexusRiskBandLabel } from "../data/tokens";
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
const USER_FRIENDLY_ERROR = "Something went wrong. Please try again.";

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
    return USER_FRIENDLY_ERROR;
  }
  return USER_FRIENDLY_ERROR;
}

function friendlyActionError(): string {
  return USER_FRIENDLY_ERROR;
}

/** Pulse: show Aegis, Pulse, Titan, Cipher (no “Sentinel …” prefix). */
function pulseSentinelDisplayName(fullName: string) {
  return fullName.startsWith("Sentinel ") ? fullName.slice("Sentinel ".length) : fullName;
}

/** Shorten agent names (Sentinel Aegis → Aegis) inside generated brief strings. */
function pulseFormatSentinelNamesInText(text: string) {
  return text
    .replace(/Sentinel Aegis/g, "Aegis")
    .replace(/Sentinel Pulse/g, "Pulse")
    .replace(/Sentinel Titan/g, "Titan")
    .replace(/Sentinel Cipher/g, "Cipher");
}

export function Pulse() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [, setUserEmail] = useState<string | null>(null);
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
  const [authLoadPhrase, setAuthLoadPhrase] = useState<"nexus" | "sentinel">("nexus");
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
      setAuthLoadPhrase((p) => (p === "nexus" ? "sentinel" : "nexus"));
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
      const rawPlan = profile?.paid_plan ?? localStorage.getItem(PLAN_STORAGE_KEY) ?? "FREE";
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
        setStatus(USER_FRIENDLY_ERROR);
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
        ? "Welcome to The Nexus. You are signed in."
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
        : "Synchronized with The Nexus.";
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
    setWatchlist(["Nexus Watchlist: HIVE"]);
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
      setWatchlist(["Nexus Watchlist: HIVE"]);
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
      const watchlistId = await createWatchlist(userId, "Nexus Watchlist");
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
      setAuthMessage({ tone: "error", text: USER_FRIENDLY_ERROR });
      setStatus(friendlyActionError());
    }
  }

  async function handleUpgradeTrigger() {
    if (checkoutBusy) return;
    const checkoutError = USER_FRIENDLY_ERROR;
    try {
      setCheckoutBusy(true);
      setStatus("Opening secure checkout…");
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "PRO" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? checkoutError);
      }
      window.location.href = data.url;
    } catch {
      setAuthMessage({ tone: "error", text: checkoutError });
      setStatus(checkoutError);
    } finally {
      setCheckoutBusy(false);
    }
  }

  function handleMotherReport() {
    setMotherReportStamp(Date.now());
    setStatus("Sentinels refreshed the Nexus overview.");
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
    authLoadPhrase === "nexus" ? "Connecting to Nexus..." : "Synchronizing Sentinels...";

  return (
    <div className="page">
      <section className="page__intro">
        <h1 className="page__headline">Pulse</h1>
        <p className="page__lede">
          The Nexus command center: Sentinel warnings, safe calls, and live alerts.
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

      <section className="nexus-core-panel">
        <div className="nexus-core-panel__head">
          <img className="nexus-core-panel__logo" src="/hivemind-logo.svg" alt="" aria-hidden />
          <div>
            <p className="nexus-core-panel__eyebrow">The Nexus</p>
            <h2 className="nexus-core-panel__title">
              Mother Core
              <span className="nexus-core-panel__core-ai">Operator intelligence</span>
            </h2>
          </div>
        </div>

        <div className="nexus-core-panel__status" aria-live="polite">
          <p className="nexus-core-panel__status-title">NEXUS ONLINE</p>
          <p className="nexus-core-panel__status-line">Mother Core: Platform intelligence online</p>
          <p className="nexus-core-panel__status-line">4 Sentinels active</p>
        </div>

        <p className="nexus-core-panel__briefing">{pulseFormatSentinelNamesInText(motherBriefing)}</p>
        <p className="nexus-core-panel__copy">
          The Nexus coordinates Aegis, Pulse, Titan, and Cipher—each Sentinel lane learns from reports, alerts,
          watchlists, and hive memory over time.
        </p>
        <div className="mother-report">
          <div className="mother-report__metrics">
            <span>Mood: {motherDailyReport.mood}</span>
            <span>Health: {motherDailyReport.systemHealth}%</span>
            <span>Grade: {motherDailyReport.oversightGrade}</span>
          </div>
          <h3>{motherDailyReport.headline}</h3>
          <p>{motherDailyReport.daySummary}</p>
          <ul>
            {motherDailyReport.priorities.map((priority) => (
              <li key={priority}>{pulseFormatSentinelNamesInText(priority)}</li>
            ))}
          </ul>
          <p className="mother-report__closing">{motherDailyReport.closingNote}</p>
          <button className="mother-report__button" type="button" onClick={handleMotherReport}>
            Ask the Sentinels for a fresh brief
          </button>
        </div>
      </section>

      <section className="sentinel-grid-panel">
        <div className="token-section__head">
          <h2 className="token-section__title">Sentinels</h2>
          <p className="token-section__lede">
            Four specialist Sentinels—ranks, XP, confidence, and learning memory
          </p>
        </div>
        <div className="synthetic-sentinels">
          {syntheticSentinels
            .filter((s) => !s.isMother)
            .map((sentinel) => {
              const progress =
                sentinel.level >= 5
                  ? 100
                  : Math.min(100, Math.round((sentinel.xp / sentinel.nextLevelXp) * 100));
              return (
                <article
                  className={`synthetic-sentinel synthetic-sentinel--${sentinel.accent}`}
                  key={sentinel.id}
                >
                  <div className="synthetic-sentinel__top">
                    <div>
                      <p className="synthetic-sentinel__name">{pulseSentinelDisplayName(sentinel.name)}</p>
                      <p className="synthetic-sentinel__desc">{sentinel.role}</p>
                    </div>
                    <span className="synthetic-sentinel__level">
                      Lv {sentinel.level} {sentinel.levelName}
                    </span>
                  </div>
                  <div className="synthetic-sentinel__meter">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <p className="synthetic-sentinel__status">{sentinel.status}</p>
                  <p className="synthetic-sentinel__lesson">{sentinel.lesson}</p>
                  <p className="synthetic-sentinel__confidence">
                    Confidence: {sentinel.confidence}% · XP: {sentinel.xp}
                  </p>
                </article>
              );
            })}
        </div>
      </section>

      <div className="pulse-card">
        <p className="pulse-card__title">Enter the Nexus</p>
        <p className="pulse-card__subtitle pulse-card__subtitle--premium">
          Sentinels online. Market intelligence ready.
        </p>
        <div className="pulse-form">
          <button className="pulse-demo-button pulse-demo-button--first" onClick={handleDemoMode} type="button">
            Enter the Nexus
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
                <strong>The Nexus · {nexusRiskBandLabel("WARNING")}</strong>
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
                  The Nexus · {nexusRiskBandLabel(token.guardian_status ?? "SAFE")}
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

      <div className="pulse-card pulse-nexus-pro-wrap" id="nexus-pro">
        <div className="pulse-nexus-pro-promo">
          <div className="pulse-nexus-pro-promo__honeycomb" aria-hidden />
          <p className="pulse-nexus-pro-promo__label">Nexus Pro</p>
          <p className="pulse-nexus-pro-promo__price">$19.99/month</p>
          <p className="pulse-nexus-pro-promo__headline">Unlimited trading intelligence. One simple price.</p>
          <p className="pulse-nexus-pro-promo__body">
            Unlock the full Nexus system with real-time Sentinel analysis, risk scanning, momentum tracking, whale
            activity signals, pattern detection, and unlimited trading intelligence tools.
          </p>
          <ul className="pulse-nexus-pro-promo__bullets">
            <li>Unlimited Nexus access</li>
            <li>Real-time Sentinel signals</li>
            <li>Scam and risk alerts</li>
            <li>Whale activity tracking</li>
            <li>Momentum and trend analysis</li>
            <li>Pattern recognition insights</li>
            <li>Fast trading links</li>
            <li>Priority platform updates</li>
          </ul>
          <div className="pulse-nexus-pro-promo__cta-wrap">
            {plan !== "PRO" ? (
              <button
                type="button"
                className="pulse-button--pro pulse-nexus-pro-promo__cta"
                disabled={checkoutBusy}
                onClick={() => void handleUpgradeTrigger()}
              >
                {checkoutBusy ? "Opening…" : "Upgrade to Nexus Pro — $19.99/month"}
              </button>
            ) : (
              <p className="pulse-nexus-pro-promo__active">Nexus Pro is active on your account.</p>
            )}
          </div>
          <p className="pulse-nexus-pro-promo__disclaimer">
            Cancel anytime. No financial advice. Trade at your own risk.
          </p>
        </div>
        <p className="pulse-card__body pulse-nexus-pro-wrap__plan">Current plan: {formatPlanName(plan)}</p>
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
