import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

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

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
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
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, paid_plan")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Backward compatibility for schemas that do not have paid_plan yet.
    const fallback = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }
  return data;
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
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase
    .from("watchlists")
    .select("id, name, watchlist_tokens(token_symbol, token_name)")
    .eq("user_id", userId);
  if (error) throw error;

  return (data ?? []).flatMap((item) =>
    (item.watchlist_tokens ?? []).map((token) => ({
      id: item.id,
      name: item.name,
      token_symbol: token.token_symbol,
      token_name: token.token_name,
    })),
  );
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
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase
    .from("guardian_alerts")
    .select("id, token_symbol, severity, title, message, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
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
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data, error } = await supabase
    .from("tracked_tokens")
    .select(
      "id, token_symbol, token_name, chain, price, volume_24h, liquidity, market_cap, guardian_score, guardian_status, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
