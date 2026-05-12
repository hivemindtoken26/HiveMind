import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const PLAN_STORAGE_KEY = "hivemind_paid_plan";
const DISMISS_STORAGE_KEY = "hivemind_nexus_pro_upsell_dismissed_at";
/** Show again after this many ms if the user closes without upgrading. */
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const OPEN_DELAY_MS = 1600;
const UNMOUNT_AFTER_CLOSE_MS = 480;
const USER_ERROR = "Something went wrong. Please try again.";

function isNexusProPlan(): boolean {
  try {
    return localStorage.getItem(PLAN_STORAGE_KEY) === "PRO";
  } catch {
    return false;
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

export function NexusProUpsellModal() {
  const location = useLocation();
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
      if (isNexusProPlan() || !cooldownElapsed()) return;
      setMounted(true);
      requestAnimationFrame(() => setOpen(true));
    }, DISMISS_COOLDOWN_MS);
  }, []);

  useEffect(() => {
    if (openDelayRef.current) {
      clearTimeout(openDelayRef.current);
      openDelayRef.current = null;
    }
    setError(null);

    if (isNexusProPlan()) {
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

    openDelayRef.current = setTimeout(() => {
      openDelayRef.current = null;
      if (isNexusProPlan() || !cooldownElapsed()) return;
      setMounted(true);
      requestAnimationFrame(() => setOpen(true));
    }, OPEN_DELAY_MS);

    return () => {
      if (openDelayRef.current) {
        clearTimeout(openDelayRef.current);
        openDelayRef.current = null;
      }
    };
  }, [location.pathname]);

  useEffect(() => {
    function onFocus() {
      if (!isNexusProPlan()) return;
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

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted, open]);

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

  if (!mounted) return null;

  return (
    <div
      className={`nexus-pro-upsell${open ? " nexus-pro-upsell--open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nexus-pro-upsell-headline"
    >
      <div className="nexus-pro-upsell__backdrop" aria-hidden />
      <div className="nexus-pro-upsell__panel">
        <div className="nexus-pro-upsell__honeycomb" aria-hidden />
        <button type="button" className="nexus-pro-upsell__close" onClick={close} aria-label="Close">
          ×
        </button>

        <p id="nexus-pro-upsell-headline" className="nexus-pro-upsell__headline">
          FIRST MONTH FREE
        </p>
        <p className="nexus-pro-upsell__sub">
          Unlimited Nexus intelligence for $19.99/month after trial.
        </p>

        <p className="nexus-pro-upsell__unlock-label">Unlock:</p>
        <ul className="nexus-pro-upsell__list">
          <li>Real-time Sentinel analysis</li>
          <li>Unlimited trading intelligence</li>
          <li>Scam and risk alerts</li>
          <li>Whale tracking</li>
          <li>Momentum signals</li>
          <li>Pattern recognition</li>
          <li>Fast trade access</li>
        </ul>

        {error ? (
          <p className="nexus-pro-upsell__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="nexus-pro-upsell__cta"
          disabled={busy}
          onClick={() => void handleStartTrial()}
        >
          {busy ? "Opening…" : "Start Free Trial"}
        </button>

        <p className="nexus-pro-upsell__fineprint">Cancel anytime. Trade at your own risk.</p>
      </div>
    </div>
  );
}
