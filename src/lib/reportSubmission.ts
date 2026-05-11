import { getCurrentUser, submitTokenReport } from "./supabaseData";
import { hasSupabaseEnv } from "./supabaseClient";

const LOCAL_KEY = "hivemind_pending_reports";
const DEFAULT_REASON = "User reported from HiveMind";

export type SubmitReportInput = {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress?: string;
  reason?: string;
  details?: string;
};

export type SubmitReportResult =
  | { ok: true; channel: "supabase" | "local" }
  | { ok: false; message: string };

function saveLocalReport(input: SubmitReportInput) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    const entry = {
      ...input,
      reason: input.reason ?? DEFAULT_REASON,
      createdAt: new Date().toISOString(),
    };
    const next = [...list, entry].slice(-50);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

export async function submitHiveMindReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const reason = input.reason?.trim() || DEFAULT_REASON;
  const details = input.details?.trim() || undefined;

  if (hasSupabaseEnv) {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return {
          ok: false,
          message: "Sign in on Pulse (email and password) to submit reports to the hive.",
        };
      }
      await submitTokenReport(
        user.id,
        input.tokenSymbol,
        input.tokenName,
        reason,
        input.tokenAddress,
        details,
      );
      return { ok: true, channel: "supabase" };
    } catch {
      return {
        ok: false,
        message: "We could not save your report. Please try again shortly.",
      };
    }
  }

  saveLocalReport({ ...input, reason, details });
  return { ok: true, channel: "local" };
}
