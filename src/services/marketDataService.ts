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
};

type DexPair = {
  baseToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
};

type FeedSource = "live" | "mock";

function patchFromDexPair(pair: DexPair): TokenPatch {
  return {
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    change24hPct: pair.priceChange?.h24,
    volume24hUsd: pair.volume?.h24,
    liquidityUsd: pair.liquidity?.usd,
    marketCapUsd: pair.fdv,
    mintAddress: pair.baseToken?.address,
  };
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
  const endpoint =
    import.meta.env.VITE_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
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
    const patch = patches[token.symbol.toUpperCase()];
    return patch ? { ...token, ...patch } : token;
  });
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
