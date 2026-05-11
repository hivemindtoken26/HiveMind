import { getSentinelMessage } from "../lib/watcherVoice";

export type GuardianStatus = "SAFE" | "WARNING" | "DANGER";

export type GuardianEngineInput = {
  tokenName: string;
  liquidityUsd: number;
  topWalletPct: number;
  top5WalletsPct: number;
  top10WalletsPct: number;
  tokenAgeHours: number;
  priceMove1hPct: number;
  priceMove24hPct: number;
  sharpPumpThenDump: boolean;
  highVolumeLowLiquidity: boolean;
  suspiciousVolumeWithFewHolders: boolean;
  similarToMajorTokenName: boolean;
  similarTickerToKnownToken: boolean;
  fakeBrandingImpersonation: boolean;
  reports24h: number;
  repeatedScamCategoryReports: boolean;
  missingSocialsOrWebsite: boolean;
  brokenWebsiteOrDeadSocials: boolean;
  riskyMintOrFreezeAuthorityActive: boolean;
};

export type GuardianEngineResult = {
  status: GuardianStatus;
  riskScore: number;
  guardianMessage: string;
  reasons: string[];
  confidence: number;
};

export type GuardianEngineConfig = {
  statusBands: { safeMax: number; warningMax: number };
  liquidity: { criticalUsd: number; lowUsd: number; criticalScore: number; lowScore: number };
  concentration: {
    topWalletPct: number;
    top5WalletsPct: number;
    top10WalletsPct: number;
    topWalletScore: number;
    top5Score: number;
    top10Score: number;
  };
  age: {
    under24hScore: number;
    under7dScore: number;
    under24hLimitHours: number;
    under7dLimitHours: number;
  };
  volatility: {
    move1hPct: number;
    move24hPct: number;
    move1hScore: number;
    move24hScore: number;
    pumpDumpScore: number;
  };
  volumeQuality: { highVolumeLowLiquidityScore: number; suspiciousVolumeScore: number };
  nameRisk: { similarNameScore: number; similarTickerScore: number; impersonationScore: number };
  reports: {
    reports5Threshold: number;
    reports20Threshold: number;
    reports5Score: number;
    reports20Score: number;
    repeatedScamScore: number;
  };
  metadata: { missingSocialsScore: number; brokenSocialsScore: number; activeAuthorityScore: number };
  confidence: { min: number; max: number; base: number; reasonBoost: number; reportsBoost: number };
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const defaultGuardianEngineConfig: GuardianEngineConfig = {
  statusBands: { safeMax: 29, warningMax: 59 },
  liquidity: { criticalUsd: 5_000, lowUsd: 20_000, criticalScore: 30, lowScore: 15 },
  concentration: {
    topWalletPct: 25,
    top5WalletsPct: 50,
    top10WalletsPct: 70,
    topWalletScore: 25,
    top5Score: 20,
    top10Score: 15,
  },
  age: {
    under24hScore: 20,
    under7dScore: 10,
    under24hLimitHours: 24,
    under7dLimitHours: 24 * 7,
  },
  volatility: {
    move1hPct: 30,
    move24hPct: 70,
    move1hScore: 10,
    move24hScore: 15,
    pumpDumpScore: 20,
  },
  volumeQuality: { highVolumeLowLiquidityScore: 15, suspiciousVolumeScore: 20 },
  nameRisk: { similarNameScore: 20, similarTickerScore: 15, impersonationScore: 25 },
  reports: {
    reports5Threshold: 5,
    reports20Threshold: 20,
    reports5Score: 10,
    reports20Score: 20,
    repeatedScamScore: 25,
  },
  metadata: { missingSocialsScore: 5, brokenSocialsScore: 10, activeAuthorityScore: 15 },
  confidence: { min: 55, max: 98, base: 70, reasonBoost: 4, reportsBoost: 4 },
};

export function mergeGuardianConfig(
  override?: DeepPartial<GuardianEngineConfig>,
): GuardianEngineConfig {
  if (!override) return defaultGuardianEngineConfig;
  return {
    statusBands: { ...defaultGuardianEngineConfig.statusBands, ...override.statusBands },
    liquidity: { ...defaultGuardianEngineConfig.liquidity, ...override.liquidity },
    concentration: {
      ...defaultGuardianEngineConfig.concentration,
      ...override.concentration,
    },
    age: { ...defaultGuardianEngineConfig.age, ...override.age },
    volatility: { ...defaultGuardianEngineConfig.volatility, ...override.volatility },
    volumeQuality: {
      ...defaultGuardianEngineConfig.volumeQuality,
      ...override.volumeQuality,
    },
    nameRisk: { ...defaultGuardianEngineConfig.nameRisk, ...override.nameRisk },
    reports: { ...defaultGuardianEngineConfig.reports, ...override.reports },
    metadata: { ...defaultGuardianEngineConfig.metadata, ...override.metadata },
    confidence: { ...defaultGuardianEngineConfig.confidence, ...override.confidence },
  };
}

export function evaluateGuardianRisk(
  input: GuardianEngineInput,
  config: GuardianEngineConfig = defaultGuardianEngineConfig,
): GuardianEngineResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (condition: boolean, points: number, reason: string) => {
    if (!condition) return;
    score += points;
    reasons.push(reason);
  };

  // Liquidity
  add(
    input.liquidityUsd < config.liquidity.criticalUsd,
    config.liquidity.criticalScore,
    `Liquidity is under $${config.liquidity.criticalUsd.toLocaleString()}, so exits can fail quickly.`,
  );
  add(
    input.liquidityUsd >= config.liquidity.criticalUsd &&
      input.liquidityUsd <= config.liquidity.lowUsd,
    config.liquidity.lowScore,
    `Liquidity is between $${config.liquidity.criticalUsd.toLocaleString()} and $${config.liquidity.lowUsd.toLocaleString()}, which is still fragile.`,
  );

  // Holder concentration
  add(
    input.topWalletPct > config.concentration.topWalletPct,
    config.concentration.topWalletScore,
    `Top wallet controls more than ${config.concentration.topWalletPct}% of supply.`,
  );
  add(
    input.top5WalletsPct > config.concentration.top5WalletsPct,
    config.concentration.top5Score,
    `Top 5 wallets hold over ${config.concentration.top5WalletsPct}% combined.`,
  );
  add(
    input.top10WalletsPct > config.concentration.top10WalletsPct,
    config.concentration.top10Score,
    `Top 10 wallets hold over ${config.concentration.top10WalletsPct}%, increasing concentration risk.`,
  );

  // Token age
  add(
    input.tokenAgeHours < config.age.under24hLimitHours,
    config.age.under24hScore,
    "Token is under 24 hours old.",
  );
  add(
    input.tokenAgeHours >= config.age.under24hLimitHours &&
      input.tokenAgeHours < config.age.under7dLimitHours,
    config.age.under7dScore,
    "Token is under 7 days old and still unproven.",
  );

  // Volatility
  add(
    Math.abs(input.priceMove1hPct) > config.volatility.move1hPct,
    config.volatility.move1hScore,
    `1h move is over ${config.volatility.move1hPct}%, showing unstable short-term action.`,
  );
  add(
    Math.abs(input.priceMove24hPct) > config.volatility.move24hPct,
    config.volatility.move24hScore,
    `24h move is over ${config.volatility.move24hPct}%, indicating extreme volatility.`,
  );
  add(
    input.sharpPumpThenDump,
    config.volatility.pumpDumpScore,
    "Pump-and-dump behavior was detected.",
  );

  // Volume quality
  add(
    input.highVolumeLowLiquidity,
    config.volumeQuality.highVolumeLowLiquidityScore,
    "Volume is high relative to liquidity.",
  );
  add(
    input.suspiciousVolumeWithFewHolders,
    config.volumeQuality.suspiciousVolumeScore,
    "Volume spike appears suspicious given holder distribution.",
  );

  // Name / copycat risk
  add(
    input.similarToMajorTokenName,
    config.nameRisk.similarNameScore,
    `${input.tokenName} looks similar to a major token name.`,
  );
  add(
    input.similarTickerToKnownToken,
    config.nameRisk.similarTickerScore,
    "Ticker appears similar to a known token.",
  );
  add(
    input.fakeBrandingImpersonation,
    config.nameRisk.impersonationScore,
    "Branding suggests impersonation or copycat behavior.",
  );

  // Community reports
  add(
    input.reports24h >= config.reports.reports20Threshold,
    config.reports.reports20Score,
    `${config.reports.reports20Threshold}+ community reports arrived in the last 24h.`,
  );
  add(
    input.reports24h >= config.reports.reports5Threshold &&
      input.reports24h < config.reports.reports20Threshold,
    config.reports.reports5Score,
    `${config.reports.reports5Threshold}+ community reports arrived in the last 24h.`,
  );
  add(
    input.repeatedScamCategoryReports,
    config.reports.repeatedScamScore,
    "Repeated scam-category reports were filed.",
  );

  // Contract / metadata issues
  add(
    input.missingSocialsOrWebsite,
    config.metadata.missingSocialsScore,
    "Token metadata is missing socials or website.",
  );
  add(
    input.brokenWebsiteOrDeadSocials,
    config.metadata.brokenSocialsScore,
    "Website or socials appear broken or inactive.",
  );
  add(
    input.riskyMintOrFreezeAuthorityActive,
    config.metadata.activeAuthorityScore,
    "Mint or freeze authority is still active in a risky setup.",
  );

  score = Math.max(0, Math.min(100, score));

  const status: GuardianStatus =
    score > config.statusBands.warningMax
      ? "DANGER"
      : score > config.statusBands.safeMax
        ? "WARNING"
        : "SAFE";

  const confidence = Math.max(
    config.confidence.min,
    Math.min(
      config.confidence.max,
      config.confidence.base +
        reasons.length * config.confidence.reasonBoost +
        (input.reports24h > 0 ? config.confidence.reportsBoost : 0),
    ),
  );

  const guardianMessage = getSentinelMessage(status);

  return {
    status,
    riskScore: score,
    guardianMessage,
    reasons,
    confidence,
  };
}
