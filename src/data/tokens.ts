import {
  evaluateGuardianRisk,
  mergeGuardianConfig,
  type DeepPartial,
  type GuardianEngineConfig,
  type GuardianEngineInput,
  type GuardianStatus,
} from "./guardianEngine";

export type GuardianRisk = GuardianStatus;

/** User-facing Nexus risk band (internal values remain SAFE | WARNING | DANGER). */
export function nexusRiskBandLabel(risk: GuardianRisk): string {
  switch (risk) {
    case "SAFE":
      return "Safe";
    case "WARNING":
      return "Warning";
    case "DANGER":
      return "Danger";
    default:
      return String(risk);
  }
}

export type Token = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  guardianRisk: GuardianRisk;
  guardianMessage: string;
  mintAddress?: string;
  logoUrl?: string;
  volume24hUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  riskScore?: number;
  riskReasons?: string[];
  confidence?: number;
  topWalletPct?: number;
  top5WalletsPct?: number;
  top10WalletsPct?: number;
  tokenAgeHours?: number;
  priceMove1hPct?: number;
  sharpPumpThenDump?: boolean;
  highVolumeLowLiquidity?: boolean;
  suspiciousVolumeWithFewHolders?: boolean;
  similarToMajorTokenName?: boolean;
  similarTickerToKnownToken?: boolean;
  fakeBrandingImpersonation?: boolean;
  reports24h?: number;
  repeatedScamCategoryReports?: boolean;
  missingSocialsOrWebsite?: boolean;
  brokenWebsiteOrDeadSocials?: boolean;
  riskyMintOrFreezeAuthorityActive?: boolean;
};

type TokenSeed = Omit<Token, "guardianRisk" | "guardianMessage" | "riskScore" | "riskReasons">;

const tokenSeeds: TokenSeed[] = [
  {
    id: "hivemind-sol",
    symbol: "HIVE",
    name: "HiveMind",
    priceUsd: 0.00432,
    change24hPct: 5.92,
    mintAddress: "5dAXtHS6xBEwuCQsgpwZDiqaByWdiQSvRYTsLnpf7i9u",
    volume24hUsd: 482364,
    liquidityUsd: 1285730,
    marketCapUsd: 43198122,
    topWalletPct: 17,
    top5WalletsPct: 41,
    top10WalletsPct: 62,
    tokenAgeHours: 96,
    priceMove1hPct: 5.1,
    sharpPumpThenDump: false,
    highVolumeLowLiquidity: false,
    suspiciousVolumeWithFewHolders: false,
    similarToMajorTokenName: false,
    similarTickerToKnownToken: false,
    fakeBrandingImpersonation: false,
    reports24h: 6,
    repeatedScamCategoryReports: false,
    missingSocialsOrWebsite: false,
    brokenWebsiteOrDeadSocials: false,
    riskyMintOrFreezeAuthorityActive: false,
  },
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    priceUsd: 102384.77,
    change24hPct: 2.14,
    volume24hUsd: 35400000000,
    liquidityUsd: 980000000,
    marketCapUsd: 2014000000000,
    topWalletPct: 3.2,
    top5WalletsPct: 12.8,
    top10WalletsPct: 21.4,
    tokenAgeHours: 124800,
    priceMove1hPct: 0.8,
    sharpPumpThenDump: false,
    highVolumeLowLiquidity: false,
    suspiciousVolumeWithFewHolders: false,
    similarToMajorTokenName: false,
    similarTickerToKnownToken: false,
    fakeBrandingImpersonation: false,
    reports24h: 0,
    repeatedScamCategoryReports: false,
    missingSocialsOrWebsite: false,
    brokenWebsiteOrDeadSocials: false,
    riskyMintOrFreezeAuthorityActive: false,
  },
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    priceUsd: 189.46,
    change24hPct: 4.78,
    volume24hUsd: 4820000000,
    liquidityUsd: 156000000,
    marketCapUsd: 89200000000,
    topWalletPct: 7.1,
    top5WalletsPct: 23,
    top10WalletsPct: 36,
    tokenAgeHours: 40800,
    priceMove1hPct: 1.5,
    sharpPumpThenDump: false,
    highVolumeLowLiquidity: false,
    suspiciousVolumeWithFewHolders: false,
    similarToMajorTokenName: false,
    similarTickerToKnownToken: false,
    fakeBrandingImpersonation: false,
    reports24h: 1,
    repeatedScamCategoryReports: false,
    missingSocialsOrWebsite: false,
    brokenWebsiteOrDeadSocials: false,
    riskyMintOrFreezeAuthorityActive: false,
  },
  {
    id: "bonk",
    symbol: "BONK",
    name: "Bonk",
    priceUsd: 0.00003412,
    change24hPct: -6.42,
    volume24hUsd: 61000000,
    liquidityUsd: 860000,
    marketCapUsd: 2340000000,
    topWalletPct: 21,
    top5WalletsPct: 47,
    top10WalletsPct: 68,
    tokenAgeHours: 12480,
    priceMove1hPct: 12.2,
    sharpPumpThenDump: false,
    highVolumeLowLiquidity: true,
    suspiciousVolumeWithFewHolders: false,
    similarToMajorTokenName: false,
    similarTickerToKnownToken: false,
    fakeBrandingImpersonation: false,
    reports24h: 7,
    repeatedScamCategoryReports: false,
    missingSocialsOrWebsite: false,
    brokenWebsiteOrDeadSocials: false,
    riskyMintOrFreezeAuthorityActive: false,
  },
  {
    id: "pepe",
    symbol: "PEPE",
    name: "Pepe",
    priceUsd: 0.00001078,
    change24hPct: 8.33,
    volume24hUsd: 138000000,
    liquidityUsd: 4400000,
    marketCapUsd: 4580000000,
    topWalletPct: 24,
    top5WalletsPct: 49,
    top10WalletsPct: 71,
    tokenAgeHours: 16560,
    priceMove1hPct: 9.4,
    sharpPumpThenDump: false,
    highVolumeLowLiquidity: false,
    suspiciousVolumeWithFewHolders: true,
    similarToMajorTokenName: false,
    similarTickerToKnownToken: false,
    fakeBrandingImpersonation: false,
    reports24h: 5,
    repeatedScamCategoryReports: false,
    missingSocialsOrWebsite: false,
    brokenWebsiteOrDeadSocials: false,
    riskyMintOrFreezeAuthorityActive: false,
  },
  {
    id: "scammoon",
    symbol: "SCAM",
    name: "ScamMoon",
    priceUsd: 0.00000091,
    change24hPct: -71.25,
    volume24hUsd: 94000,
    liquidityUsd: 22000,
    marketCapUsd: 490000,
    topWalletPct: 39,
    top5WalletsPct: 78,
    top10WalletsPct: 91,
    tokenAgeHours: 18,
    priceMove1hPct: 41,
    sharpPumpThenDump: true,
    highVolumeLowLiquidity: true,
    suspiciousVolumeWithFewHolders: true,
    similarToMajorTokenName: true,
    similarTickerToKnownToken: true,
    fakeBrandingImpersonation: true,
    reports24h: 29,
    repeatedScamCategoryReports: true,
    missingSocialsOrWebsite: true,
    brokenWebsiteOrDeadSocials: true,
    riskyMintOrFreezeAuthorityActive: true,
  },
];

function toGuardianInput(token: TokenSeed): GuardianEngineInput {
  return {
    tokenName: token.name,
    liquidityUsd: token.liquidityUsd ?? 0,
    topWalletPct: token.topWalletPct ?? 0,
    top5WalletsPct: token.top5WalletsPct ?? 0,
    top10WalletsPct: token.top10WalletsPct ?? 0,
    tokenAgeHours: token.tokenAgeHours ?? 0,
    priceMove1hPct: token.priceMove1hPct ?? 0,
    priceMove24hPct: token.change24hPct,
    sharpPumpThenDump: token.sharpPumpThenDump ?? false,
    highVolumeLowLiquidity: token.highVolumeLowLiquidity ?? false,
    suspiciousVolumeWithFewHolders: token.suspiciousVolumeWithFewHolders ?? false,
    similarToMajorTokenName: token.similarToMajorTokenName ?? false,
    similarTickerToKnownToken: token.similarTickerToKnownToken ?? false,
    fakeBrandingImpersonation: token.fakeBrandingImpersonation ?? false,
    reports24h: token.reports24h ?? 0,
    repeatedScamCategoryReports: token.repeatedScamCategoryReports ?? false,
    missingSocialsOrWebsite: token.missingSocialsOrWebsite ?? false,
    brokenWebsiteOrDeadSocials: token.brokenWebsiteOrDeadSocials ?? false,
    riskyMintOrFreezeAuthorityActive: token.riskyMintOrFreezeAuthorityActive ?? false,
  };
}

export function buildSampleTokens(
  configOverride?: DeepPartial<GuardianEngineConfig>,
): Token[] {
  const config = mergeGuardianConfig(configOverride);
  return tokenSeeds.map((token) => {
    const guardian = evaluateGuardianRisk(toGuardianInput(token), config);

    return {
      ...token,
      guardianRisk: guardian.status,
      guardianMessage: guardian.guardianMessage,
      riskScore: guardian.riskScore,
      riskReasons: guardian.reasons,
      confidence: guardian.confidence,
    };
  });
}

export const sampleTokens: Token[] = buildSampleTokens();
