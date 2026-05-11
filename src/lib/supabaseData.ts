import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

function flattenErrorDiagnostics(err: unknown): string {
  const parts: string[] = [];
  const visit = (e: unknown): void => {
    if (e == null || typeof e === "boolean") return;
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (typeof e !== "object") return;
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.details === "string") parts.push(o.details);
    if (typeof o.hint === "string") parts.push(o.hint);
    if (typeof o.code === "string" || typeof o.code === "number") parts.push(String(o.code));
    if ("cause" in o && o.cause !== e) visit(o.cause);
  };
  visit(err);
  return parts.join(" ");
}

/**
 * Missing tables/functions (often `… does not exist`, PGRST schema cache) sometimes bubble up via auth
 * triggers or hooks; map to a concrete fix instead of a raw Postgres string.
 */
function throwIfStructuralDbFailure(err: unknown): never {
  const blob = flattenErrorDiagnostics(err).toLowerCase();
  const plainAuth =
    blob.includes("invalid login credentials") ||
    blob.includes("invalid_grant") ||
    blob.includes("invalid email") ||
    blob.includes("email not confirmed") ||
    blob.includes("email address not authorized") ||
    blob.includes("user already registered");

  const structural =
    blob.includes("does not exist") ||
    blob.includes("undefined_table") ||
    blob.includes("undefined function") ||
    blob.includes("42p01") || // undefined_table
    blob.includes("42883") || // undefined_function
    blob.includes("could not find the table") ||
    blob.includes("schema cache") ||
    blob.includes("pgrst205");

  if (!plainAuth && structural) {
    throw new Error(
      "We could not complete sign-in right now. Please try again in a few minutes or contact support if this continues.",
    );
  }

  throw err instanceof Error ? err : new Error(flattenErrorDiagnostics(err) || "Unexpected error");
}

type AppProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  paid_plan?: "FREE" | "BASIC" | "PRO" | null;
};

export type WatchlistRecord = {
  id: string;
  name: string;
  token_symbol: string;
  token_name: string;
};

export async function signUpWithEmail(
  email: string,
  password: string,
  normalizedUsername?: string,
) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(normalizedUsername
      ? { options: { data: { username: normalizedUsername } } }
      : {}),
  });
  if (error) throwIfStructuralDbFailure(error);
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throwIfStructuralDbFailure(error);
  let session: Session | null = data.session;
  let user: User | null = data.user;
  if (user && !session) {
    const { data: refreshed } = await supabase.auth.getSession();
    session = refreshed.session;
    user = refreshed.session?.user ?? user;
  }
  return { ...data, session, user };
}

export async function signOut() {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user ?? null;
}

/** Letters, numbers, underscores; max length 30 (matches signup validation). */
export function normalizeSignupUsername(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, 30);
}

function displayNameFromUsernameSlug(slug: string): string {
  const words = slug.split("_").filter(Boolean);
  if (!words.length) return "HiveMind member";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isPostgresUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code === "23505";
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(msg);
}

/** Email-based fallback when no chosen username (e.g. old clients); matches SQL fallback. */
export function buildFallbackProfileFields(
  email: string,
  userId: string,
): { username: string; displayName: string } {
  const at = email.indexOf("@");
  const local = (at >= 0 ? email.slice(0, at) : email).trim() || "user";
  const shortId = userId.replace(/-/g, "").slice(0, 8);
  let slug = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!slug) slug = "user";
  slug = slug.slice(0, 24);
  const username = `${slug}_${shortId}`;
  const displayName =
    local.replace(/\./g, " ").replace(/_/g, " ").trim() || "HiveMind member";
  return { username, displayName };
}

/**
 * Saves chosen signup username to profiles. Retries with a short id suffix if `username` is taken.
 */
export async function upsertSignupProfile(
  userId: string,
  email: string,
  chosenUsernameRaw: string,
): Promise<{ username: string; displayName: string }> {
  const normalized = normalizeSignupUsername(chosenUsernameRaw);
  if (normalized.length < 3) {
    const fb = buildFallbackProfileFields(email, userId);
    await upsertProfile(userId, fb.displayName, fb.username);
    return fb;
  }

  const shortId = userId.replace(/-/g, "").slice(0, 8);
  const displayPreferred = displayNameFromUsernameSlug(normalized);

  try {
    await upsertProfile(userId, displayPreferred, normalized);
    return { username: normalized, displayName: displayPreferred };
  } catch (err) {
    if (!isPostgresUniqueViolation(err)) throw err;
    const suffixed = `${normalized.slice(0, Math.min(20, normalized.length))}_${shortId}`;
    const displaySuffixed = displayNameFromUsernameSlug(suffixed);
    await upsertProfile(userId, displaySuffixed, suffixed);
    return { username: suffixed, displayName: displaySuffixed };
  }
}

export async function upsertProfile(userId: string, displayName: string, username: string) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    display_name: displayName,
    username,
  });
  if (error) throw error;
}

export async function updatePaidPlan(userId: string, paidPlan: "FREE" | "BASIC" | "PRO") {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    paid_plan: paidPlan,
  });
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<AppProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, paid_plan")
      .eq("id", userId)
      .maybeSingle();
    if (!error) return data;

    const fallback = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (!fallback.error) return fallback.data as AppProfile | null;
  } catch {
    /* empty profile / missing table / RLS — do not break auth */
  }
  return null;
}

export async function createWatchlist(userId: string, name: string) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase
    .from("watchlists")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function addWatchlistToken(
  watchlistId: string,
  tokenSymbol: string,
  tokenName: string,
  tokenAddress?: string,
) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.from("watchlist_tokens").insert({
    watchlist_id: watchlistId,
    token_symbol: tokenSymbol,
    token_name: tokenName,
    token_address: tokenAddress ?? null,
  });
  if (error) throw error;
}

export async function fetchWatchlistTokens(userId: string): Promise<WatchlistRecord[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("watchlists")
      .select("id, name, watchlist_tokens(token_symbol, token_name)")
      .eq("user_id", userId);
    if (error) return [];

    return (data ?? []).flatMap((item) =>
      (item.watchlist_tokens ?? []).map((token) => ({
        id: item.id,
        name: item.name,
        token_symbol: token.token_symbol,
        token_name: token.token_name,
      })),
    );
  } catch {
    return [];
  }
}

export async function submitTokenReport(
  userId: string,
  tokenSymbol: string,
  tokenName: string,
  reason: string,
  tokenAddress?: string,
  details?: string,
) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.from("token_reports").insert({
    user_id: userId,
    token_symbol: tokenSymbol,
    token_name: tokenName,
    token_address: tokenAddress ?? null,
    reason,
    details: details ?? null,
  });
  if (error) throw error;
}

export async function fetchGuardianAlerts() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("guardian_alerts")
      .select("id, token_symbol, severity, title, message, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function upsertTrackedToken(input: {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress?: string;
  chain?: string;
  price?: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  guardianScore?: number;
  guardianStatus?: "SAFE" | "WARNING" | "DANGER";
}) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.from("tracked_tokens").upsert({
    token_symbol: input.tokenSymbol,
    token_name: input.tokenName,
    token_address: input.tokenAddress ?? null,
    chain: input.chain ?? "solana",
    price: input.price ?? null,
    volume_24h: input.volume24h ?? null,
    liquidity: input.liquidity ?? null,
    market_cap: input.marketCap ?? null,
    guardian_score: input.guardianScore ?? null,
    guardian_status: input.guardianStatus ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchTrackedTokens() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("tracked_tokens")
      .select(
        "id, token_symbol, token_name, chain, price, volume_24h, liquidity, market_cap, guardian_score, guardian_status, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
