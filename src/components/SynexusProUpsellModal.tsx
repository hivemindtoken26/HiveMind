import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { isSynexusBootComplete, subscribeSynexusBootComplete } from "../lib/synexusBootComplete";

const PLAN_STORAGE_KEY = "hivemind_paid_plan";
const DISMISS_STORAGE_KEY = "hivemind_synexus_pro_upsell_dismissed_at";
/** Auto pulse runs twice then hides until next tab/session or timed reopen after dismiss. */
const AUTO_PROMO_SESSION_KEY = "hivemind_synexus_promo_pulse_completed";
/** CSS animation-name on `.synexus-pro-upsell__panel` (must match index.css). */
const PROMO_PULSE_ANIMATION = "synexus-pro-upsell-pulse-cycle";
/** Show again after this many ms if the user closes without upgrading. */
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** After boot intro completes, extra pause before the promo appears. */
const OPEN_DELAY_MS = 900;
const UNMOUNT_AFTER_CLOSE_MS = 480;
const USER_ERROR = "Something went wrong. Please try again.";

function isSynexusProPlan(): boolean {
  try {
    return localStorage.getItem(PLAN_STORAGE_KEY) === "PRO";
  } catch {
    return false;
  }
}

function autoPromoAlreadyPlayedThisSession(): boolean {
  try {
    return sessionStorage.getItem(AUTO_PROMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markAutoPromoPlayedThisSession(): void {
  try {
    sessionStorage.setItem(AUTO_PROMO_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function cooldownElapsed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return true;
    const d = Number(raw);
    if (!Number.isFinite(d)) return true;
    return Date.now() - d >= DISMISS_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function SynexusProUpsellModal() {
  const location = useLocation();
  const [bootComplete, setBootComplete] = useState(() => isSynexusBootComplete());
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }

    if (unmountRef.current) clearTimeout(unmountRef.current);
    unmountRef.current = setTimeout(() => {
      unmountRef.current = null;
      setMounted(false);
    }, UNMOUNT_AFTER_CLOSE_MS);

    if (reopenRef.current) clearTimeout(reopenRef.current);
    reopenRef.current = setTimeout(() => {
      reopenRef.current = null;
      if (isSynexusProPlan() || !cooldownElapsed()) return;
      setMounted(true);
      requestAnimationFrame(() => setOpen(true));
    }, DISMISS_COOLDOWN_MS);
  }, []);

  useEffect(() => subscribeSynexusBootComplete(() => setBootComplete(true)), []);

  useEffect(() => {
    if (openDelayRef.current) {
      clearTimeout(openDelayRef.current);
      openDelayRef.current = null;
    }
    setError(null);

    if (isSynexusProPlan()) {
      if (reopenRef.current) {
        clearTimeout(reopenRef.current);
        reopenRef.current = null;
      }
      if (unmountRef.current) {
        clearTimeout(unmountRef.current);
        unmountRef.current = null;
      }
      setMounted(false);
      setOpen(false);
      return;
    }

    if (!cooldownElapsed()) {
      setMounted(false);
      setOpen(false);
      return;
    }

    if (autoPromoAlreadyPlayedThisSession()) return;

    if (!bootComplete) return;

    openDelayRef.current = setTimeout(() => {
      openDelayRef.current = null;
      if (isSynexusProPlan() || !cooldownElapsed()) return;
      setMounted(true);
      requestAnimationFrame(() => setOpen(true));
    }, OPEN_DELAY_MS);

    return () => {
      if (openDelayRef.current) {
        clearTimeout(openDelayRef.current);
        openDelayRef.current = null;
      }
    };
  }, [bootComplete, location.pathname]);

  useEffect(() => {
    function onFocus() {
      if (!isSynexusProPlan()) return;
      if (reopenRef.current) {
        clearTimeout(reopenRef.current);
        reopenRef.current = null;
      }
      if (unmountRef.current) {
        clearTimeout(unmountRef.current);
        unmountRef.current = null;
      }
      setOpen(false);
      setMounted(false);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(
    () => () => {
      if (openDelayRef.current) clearTimeout(openDelayRef.current);
      if (reopenRef.current) clearTimeout(reopenRef.current);
      if (unmountRef.current) clearTimeout(unmountRef.current);
    },
    [],
  );

  async function handleStartTrial() {
    if (busy) return;
    setError(null);
    try {
      setBusy(true);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "PRO" }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (!response.ok || !data.url) throw new Error(USER_ERROR);
      window.location.href = data.url;
    } catch {
      setError(USER_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function finishAutoPromoSequence() {
    markAutoPromoPlayedThisSession();
    setOpen(false);
    setError(null);
    if (unmountRef.current) clearTimeout(unmountRef.current);
    unmountRef.current = setTimeout(() => {
      unmountRef.current = null;
      setMounted(false);
    }, UNMOUNT_AFTER_CLOSE_MS);
  }

  function handlePanelAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.animationName !== PROMO_PULSE_ANIMATION) return;
    if (e.target !== e.currentTarget) return;
    finishAutoPromoSequence();
  }

  if (!mounted) return null;

  return (
    <div
      className={`synexus-pro-upsell${open ? " synexus-pro-upsell--open" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="synexus-pro-upsell-headline"
    >
      <div className="synexus-pro-upsell__backdrop" aria-hidden />
      <div className="synexus-pro-upsell__stage-shell">
        <div className="synexus-pro-upsell__pulse">
          <div className="synexus-pro-upsell__panel" onAnimationEnd={handlePanelAnimationEnd}>
            <div className="synexus-pro-upsell__honeycomb" aria-hidden />
            <button type="button" className="synexus-pro-upsell__close" onClick={close} aria-label="Close">
              ×
            </button>

            <p id="synexus-pro-upsell-headline" className="synexus-pro-upsell__headline">
              FIRST MONTH FREE
            </p>
            <p className="synexus-pro-upsell__sub">
              Synexus Pro — unlimited intel. $19.99/mo after trial.
            </p>
            <p className="synexus-pro-upsell__perks">
              Sentinel lanes · Whale watch · Risk &amp; scam alerts · Momentum cues
            </p>

            {error ? (
              <p className="synexus-pro-upsell__error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="synexus-pro-upsell__cta"
              disabled={busy}
              onClick={() => void handleStartTrial()}
            >
              {busy ? "Opening…" : "Start free trial"}
            </button>

            <p className="synexus-pro-upsell__fineprint">Cancel anytime. Trade at your own risk.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
