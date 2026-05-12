export type SentinelRank = "Scout" | "Sentinel" | "Bulwark" | "Oracle" | "Hive Core";

export type SyntheticSentinel = {
  id: string;
  name: string;
  role: string;
  level: number;
  levelName: SentinelRank;
  xp: number;
  nextLevelXp: number;
  confidence: number;
  status: string;
  lesson: string;
  accent: "green" | "gold" | "danger";
  isMother?: boolean;
};

type SentinelSignals = {
  watchlistCount: number;
  alertCount: number;
  trackedCount: number;
  reportCount: number;
  plan: "FREE" | "PRO";
};

export type MotherDailyReport = {
  mood: "Calm" | "Alert" | "High Guard";
  systemHealth: number;
  oversightGrade: "A" | "B" | "C";
  headline: string;
  daySummary: string;
  priorities: string[];
  closingNote: string;
};

const RANKS: SentinelRank[] = ["Scout", "Sentinel", "Bulwark", "Oracle", "Hive Core"];
const XP_PER_LEVEL = 140;

const sentinelSeeds = [
  {
    id: "mother",
    name: "Mother",
    role: "Core AI",
    baseXp: 180,
    status: "Mother Core: Coordinating Sentinel lanes across The Nexus.",
    lesson: "Mother Core binds Sentinel outputs into one operational picture.",
    accent: "gold" as const,
    isMother: true,
  },
  {
    id: "aegis",
    name: "Sentinel Aegis",
    role: "Scam and risk detection.",
    baseXp: 40,
    status: "Screening contracts, liquidity shifts, and early scam signatures.",
    lesson: "Confirmed reports sharpen Aegis against the next risk pattern.",
    accent: "green" as const,
  },
  {
    id: "pulse",
    name: "Sentinel Pulse",
    role: "Momentum and trend analysis.",
    baseXp: 78,
    status: "Tracking momentum, trend breaks, and abnormal volume bursts.",
    lesson: "Pulse learns which moves are real demand and which are noise.",
    accent: "green" as const,
  },
  {
    id: "titan",
    name: "Sentinel Titan",
    role: "Whale wallet tracking.",
    baseXp: 104,
    status: "Following large wallets, concentration shifts, and outsized flows.",
    lesson: "Titan maps whale behavior to exit risk before it hits the feed.",
    accent: "danger" as const,
  },
  {
    id: "cipher",
    name: "Sentinel Cipher",
    role: "Pattern recognition and AI intelligence.",
    baseXp: 116,
    status: "Correlating historical ripples with today's warning combinations.",
    lesson: "Cipher tightens confidence when multiple weak signals align.",
    accent: "gold" as const,
  },
];

function getRankForLevel(level: number): SentinelRank {
  return RANKS[Math.min(level - 1, RANKS.length - 1)];
}

function scoreSignals(signals: SentinelSignals) {
  const planBoost = signals.plan === "PRO" ? 90 : 0;
  return (
    signals.watchlistCount * 18 +
    signals.alertCount * 24 +
    signals.trackedCount * 20 +
    signals.reportCount * 30 +
    planBoost
  );
}

export function buildSyntheticSentinels(signals: SentinelSignals): SyntheticSentinel[] {
  const signalXp = scoreSignals(signals);

  return sentinelSeeds.map((sentinel, index) => {
    const xp = sentinel.baseXp + signalXp + index * 17;
    const level = Math.min(5, Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1));
    const nextLevelXp = level >= 5 ? xp : level * XP_PER_LEVEL;
    const confidence = Math.min(97, 54 + level * 7 + signals.alertCount * 2 + signals.reportCount);

    return {
      ...sentinel,
      level,
      levelName: getRankForLevel(level),
      xp,
      nextLevelXp,
      confidence,
    };
  });
}

export function buildMotherBriefing(sentinels: SyntheticSentinel[], signals: SentinelSignals): string {
  const mother = sentinels.find((s) => s.isMother);
  const activeAlerts = signals.alertCount;
  const watchedTokens = signals.watchlistCount + signals.trackedCount;
  const topLevel = Math.max(...sentinels.map((s) => s.level));

  return `The Nexus · Sentinels overview: ${activeAlerts} alert signal${activeAlerts === 1 ? "" : "s"} reviewed, ${watchedTokens} watched asset${watchedTokens === 1 ? "" : "s"} monitored, top Sentinel rank ${topLevel}. Oversight confidence ${mother?.confidence ?? 70}%.`;
}

export function buildMotherDailyReport(
  sentinels: SyntheticSentinel[],
  signals: SentinelSignals,
): MotherDailyReport {
  const averageConfidence = Math.round(
    sentinels.reduce((total, s) => total + s.confidence, 0) / sentinels.length,
  );
  const activeAlerts = signals.alertCount;
  const watchedAssets = signals.watchlistCount + signals.trackedCount;
  const mood =
    activeAlerts >= 4 ? "High Guard" : activeAlerts >= 1 || signals.reportCount >= 2 ? "Alert" : "Calm";
  const systemHealth = Math.min(99, Math.max(55, averageConfidence + signals.trackedCount * 2));
  const oversightGrade = systemHealth >= 86 ? "A" : systemHealth >= 72 ? "B" : "C";
  const topSentinel = sentinels
    .filter((s) => !s.isMother)
    .sort((a, b) => b.level - a.level || b.confidence - a.confidence)[0];

  return {
    mood,
    systemHealth,
    oversightGrade,
    headline: `Mother Core: System stable — Sentinel discipline is ${oversightGrade}-grade.`,
    daySummary:
      watchedAssets > 0
        ? `${watchedAssets} watched asset${watchedAssets === 1 ? "" : "s"} tracked, ${activeAlerts} alert stream${activeAlerts === 1 ? "" : "s"} reviewed, and ${signals.reportCount} hive report${signals.reportCount === 1 ? "" : "s"} folded into memory.`
        : "No watchlisted assets yet. The Nexus is in standby demo mode, waiting for fresh reports.",
    priorities: [
      activeAlerts > 0
        ? "Review active alerts and confirm whether each warning was useful."
        : "Add tokens to your watchlist so Sentinels can start building memory.",
      signals.reportCount > 0
        ? "Keep collecting community reports so Sentinel Cipher can strengthen pattern memory."
        : "Use report buttons on suspicious tokens to train Aegis and the Sentinels.",
      topSentinel
        ? `${topSentinel.name} is leading today at level ${topSentinel.level}. Feed it more signals to push toward ${topSentinel.levelName}.`
        : "Launch demo mode to wake the Sentinels and generate a training baseline.",
    ],
    closingNote:
      mood === "High Guard"
        ? "The Nexus recommends staying defensive today. Activity is elevated—keep alerts on."
        : mood === "Alert"
          ? "Sentinels see movement worth watching. Verify anything suspicious."
          : "The Nexus reports a calm grid. Good day to train watchlists and sharpen alerts.",
  };
}
