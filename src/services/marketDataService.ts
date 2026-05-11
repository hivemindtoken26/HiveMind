import type { DeepPartial, GuardianEngineConfig } from "../data/guardianEngine";
import { buildSampleTokens, type Token } from "../data/tokens";
import { loadGuardianConfigOverride } from "./guardianConfigService";

type TokenPatch = {
  priceUsd?: number;
  change24hPct?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  mintAddress?: string;
  logoUrl?: string;
};

type DexPair = {
  baseToken?: { symbol?: string; name?: string; address?: string };
  info?: { imageUrl?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
};

type FeedSource = "live" | "mock";

export type PriceHistoryRange = "1D" | "1W" | "1Y";

export type PriceHistoryPoint = {
  timestamp: number;
  priceUsd: number;
};

export type PriceHistoryResult = {
  range: PriceHistoryRange;
  points: PriceHistoryPoint[];
  source: FeedSource;
  intervalLabel: string;
  updatedAt: number;
};

const HISTORY_CONFIG: Record<
  PriceHistoryRange,
  { seconds: number; type: string; intervalLabel: string; fallbackPoints: number }
> = {
  "1D": { seconds: 24 * 60 * 60, type: "1m", intervalLabel: "1-minute", fallbackPoints: 48 },
  "1W": { seconds: 7 * 24 * 60 * 60, type: "1H", intervalLabel: "1-hour", fallbackPoints: 56 },
  "1Y": { seconds: 365 * 24 * 60 * 60, type: "1D", intervalLabel: "1-day", fallbackPoints: 52 },
};

function toFiniteNumber(value: number | string | undefined): number | undefined {
  const numberValue =
    typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function compactPatch(patch: TokenPatch): TokenPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as TokenPatch;
}

function patchFromDexPair(pair: DexPair): TokenPatch {
  const imageUrl = pair.info?.imageUrl?.trim();
  return compactPatch({
    priceUsd: toFiniteNumber(pair.priceUsd),
    change24hPct: toFiniteNumber(pair.priceChange?.h24),
    volume24hUsd: toFiniteNumber(pair.volume?.h24),
    liquidityUsd: toFiniteNumber(pair.liquidity?.usd),
    marketCapUsd: toFiniteNumber(pair.fdv),
    mintAddress: pair.baseToken?.address,
    logoUrl: imageUrl?.startsWith("http") ? imageUrl : undefined,
  });
}

function readHistoryPrice(item: Record<string, unknown>): number | undefined {
  return (
    toFiniteNumber(item.value as number | string | undefined) ??
    toFiniteNumber(item.price as number | string | undefined) ??
    toFiniteNumber(item.close as number | string | undefined) ??
    toFiniteNumber(item.c as number | string | undefined)
  );
}

function readHistoryTimestamp(item: Record<string, unknown>): number | undefined {
  const raw =
    toFiniteNumber(item.unixTime as number | string | undefined) ??
    toFiniteNumber(item.timestamp as number | string | undefined) ??
    toFiniteNumber(item.time as number | string | undefined);
  if (!raw) return undefined;
  return raw > 10_000_000_000 ? raw : raw * 1000;
}

function generateFallbackHistory(token: Token, range: PriceHistoryRange): PriceHistoryPoint[] {
  const config = HISTORY_CONFIG[range];
  const now = Date.now();
  const start = now - config.seconds * 1000;
  const count = config.fallbackPoints;
  const currentPrice = token.priceUsd;
  const totalChangePct = token.change24hPct / 100;
  const startPrice = currentPrice / (1 + totalChangePct || 1);

  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const wave = Math.sin(progress * Math.PI * 4 + token.symbol.length) * 0.012;
    const pulse = Math.cos(progress * Math.PI * 7 + token.name.length) * 0.006;
    const priceUsd = startPrice + (currentPrice - startPrice) * progress;

    return {
      timestamp: Math.round(start + (now - start) * progress),
      priceUsd: Math.max(0, priceUsd * (1 + wave + pulse)),
    };
  });
}

async function fetchDexPairByAddress(address: string): Promise<DexPair | null> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { pairs?: DexPair[] };
  return (data.pairs ?? [])[0] ?? null;
}

async function fetchDexPairBySearch(symbol: string, name: string): Promise<DexPair | null> {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(`${symbol} ${name}`)}`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { pairs?: DexPair[] };
  const best = (data.pairs ?? [])
    .filter((pair) => pair.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase())
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return best ?? null;
}

async function fetchDexScreenerPatches(baseTokens: Token[]): Promise<{
  patches: Record<string, TokenPatch>;
  source: FeedSource;
  liveCount: number;
}> {
  try {
    const patches: Record<string, TokenPatch> = {};
    let liveCount = 0;
    await Promise.all(
      baseTokens.map(async (token) => {
        const pair = token.mintAddress
          ? await fetchDexPairByAddress(token.mintAddress)
          : await fetchDexPairBySearch(token.symbol, token.name);
        if (!pair) return;
        patches[token.symbol.toUpperCase()] = patchFromDexPair(pair);
        liveCount += 1;
      }),
    );
    if (!liveCount) {
      throw new Error("DexScreener returned no matching pairs");
    }
    return { patches, source: "live", liveCount };
  } catch {
    // Mock fallback path
    return {
      source: "mock",
      liveCount: 0,
      patches: {
        HIVE: {
          priceUsd: 0.00432,
          change24hPct: 5.92,
          volume24hUsd: 482364,
          liquidityUsd: 1285730,
          marketCapUsd: 43198122,
          mintAddress: "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
        },
        BONK: { priceUsd: 0.00003412, change24hPct: -6.42, volume24hUsd: 61000000 },
        PEPE: { priceUsd: 0.00001078, change24hPct: 8.33, volume24hUsd: 138000000 },
      },
    };
  }
}

async function fetchBirdeyePatches(): Promise<Record<string, TokenPatch>> {
  const apiKey = import.meta.env.VITE_BIRDEYE_API_KEY;
  if (!apiKey) {
    return {
      HIVE: { liquidityUsd: 1285730, marketCapUsd: 43198122 },
      SOL: { liquidityUsd: 156000000, marketCapUsd: 89200000000 },
    };
  }

  try {
    const response = await fetch(
      "https://public-api.birdeye.so/defi/token_overview?address=5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
      { headers: { "X-API-KEY": apiKey } },
    );
    if (!response.ok) throw new Error("Birdeye request failed");
    const data = (await response.json()) as {
      data?: { symbol?: string; liquidity?: number; marketCap?: number; price?: number };
    };
    const symbol = data.data?.symbol?.toUpperCase();
    if (!symbol) return {};
    return {
      [symbol]: {
        priceUsd: data.data?.price,
        liquidityUsd: data.data?.liquidity,
        marketCapUsd: data.data?.marketCap,
      },
    };
  } catch {
    return {};
  }
}

async function fetchSolanaRpcPatch(): Promise<TokenPatch> {
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL;
  if (!endpoint) {
    return {
      mintAddress: "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: ["5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u", { encoding: "jsonParsed" }],
      }),
    });
    if (!response?.ok) throw new Error("RPC request failed");
    const data = (await response.json().catch(() => undefined)) as
      | { result?: unknown }
      | undefined;
    if (!data?.result) throw new Error("RPC returned no account data");
    // The response proves account accessibility; we keep pricing from market providers.
    return {};
  } catch {
    return {
      mintAddress: "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
    };
  }
}

function applyPatches(tokens: Token[], patches: Record<string, TokenPatch>): Token[] {
  return tokens.map((token) => {
    const patch = compactPatch(patches[token.symbol.toUpperCase()] ?? {});
    return patch ? { ...token, ...patch } : token;
  });
}

export async function fetchTokenPriceHistory(
  token: Token,
  range: PriceHistoryRange,
): Promise<PriceHistoryResult> {
  const config = HISTORY_CONFIG[range];
  const now = Date.now();
  const from = Math.floor((now - config.seconds * 1000) / 1000);
  const to = Math.floor(now / 1000);
  const apiKey = import.meta.env.VITE_BIRDEYE_API_KEY;

  if (apiKey && token.mintAddress) {
    try {
      const params = new URLSearchParams({
        address: token.mintAddress,
        address_type: "token",
        type: config.type,
        time_from: String(from),
        time_to: String(to),
      });
      const response = await fetch(`https://public-api.birdeye.so/defi/history_price?${params}`, {
        headers: {
          "X-API-KEY": apiKey,
          "x-chain": "solana",
        },
      });
      if (!response.ok) throw new Error("Birdeye history request failed");
      const data = (await response.json()) as {
        data?: { items?: Record<string, unknown>[] };
      };
      const points = (data.data?.items ?? [])
        .map((item) => {
          const timestamp = readHistoryTimestamp(item);
          const priceUsd = readHistoryPrice(item);
          return timestamp && priceUsd ? { timestamp, priceUsd } : null;
        })
        .filter((point): point is PriceHistoryPoint => Boolean(point))
        .sort((a, b) => a.timestamp - b.timestamp);

      if (points.length >= 2) {
        return {
          range,
          points,
          source: "live",
          intervalLabel: config.intervalLabel,
          updatedAt: now,
        };
      }
    } catch {
      // Fall through to generated history so the chart stays usable.
    }
  }

  return {
    range,
    points: generateFallbackHistory(token, range),
    source: "mock",
    intervalLabel: config.intervalLabel,
    updatedAt: now,
  };
}

export async function fetchMvpTokenFeed() {
  const guardianOverride = await loadGuardianConfigOverride();
  const baseTokens = buildSampleTokens(guardianOverride);
  const [dexResult, birdeyePatches, solanaPatch] = await Promise.all([
    fetchDexScreenerPatches(baseTokens),
    fetchBirdeyePatches(),
    fetchSolanaRpcPatch(),
  ]);

  const mergedPatches: Record<string, TokenPatch> = { ...dexResult.patches };
  for (const [symbol, patch] of Object.entries(birdeyePatches)) {
    mergedPatches[symbol] = { ...mergedPatches[symbol], ...patch };
  }
  mergedPatches.HIVE = { ...mergedPatches.HIVE, ...solanaPatch };

  const all = applyPatches(baseTokens, mergedPatches);
  const trending = all
    .slice()
    .sort((a, b) => b.change24hPct - a.change24hPct)
    .slice(0, 3);
  const alerts = all.filter((token) => token.guardianRisk !== "SAFE");
  const verified = all.filter((token) => token.guardianRisk === "SAFE");

  return {
    all,
    trending,
    alerts,
    verified,
    source: dexResult.source,
    dexLiveCount: dexResult.liveCount,
  };
}

export async function fetchTokenDetailById(tokenId: string) {
  const feed = await fetchMvpTokenFeed();
  return feed.all.find((token) => token.id === tokenId) ?? null;
}

export async function previewTokensWithGuardianConfig(
  override?: DeepPartial<GuardianEngineConfig>,
) {
  return buildSampleTokens(override);
}
