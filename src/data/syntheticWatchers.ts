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
    role: "Overseer of the Nexus Sentinels",
    baseXp: 180,
    status: "Auditing every Sentinel for accuracy, drift, and missed alerts.",
    lesson: "Mother learns from the whole hive and reports the day back to you.",
    accent: "gold" as const,
    isMother: true,
  },
  {
    id: "morpheus",
    name: "Morpheus",
    role: "Trending token momentum and hype tracker",
    baseXp: 40,
    status: "Tracking trending tokens, momentum spikes, hype waves, and fresh suspicious launches.",
    lesson: "Learning which hype patterns become real movement and which ones become real risk.",
    accent: "green" as const,
  },
  {
    id: "warden",
    name: "Warden",
    role: "Liquidity and wallet guard",
    baseXp: 78,
    status: "Watching liquidity depth, whale concentration, and fast exits.",
    lesson: "Learning from tokens with unstable liquidity and holder clusters.",
    accent: "green" as const,
  },
  {
    id: "surge",
    name: "Surge",
    role: "Sudden volume spike detector",
    baseXp: 104,
    status: "Watching for sudden volume spikes, abnormal trading bursts, and fast momentum breaks.",
    lesson: "Learning which volume spikes are real demand and which ones are manipulation.",
    accent: "green" as const,
  },
  {
    id: "oracle",
    name: "Oracle",
    role: "Pattern intelligence",
    baseXp: 116,
    status: "Comparing today’s warnings against past scam behavior.",
    lesson: "Learning which warning combinations deserve higher confidence.",
    accent: "gold" as const,
  },
  {
    id: "whale-sentinel",
    name: "Whale Sentinel",
    role: "Large wallet, big buy, and big sell tracker",
    baseXp: 92,
    status: "Tracking large wallets, big buys, big sells, whale concentration, and fast exits.",
    lesson: "Learning which whale buys show real demand and which whale sells become danger.",
    accent: "danger" as const,
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

  return `Mother report: ${activeAlerts} alert signal${activeAlerts === 1 ? "" : "s"} reviewed, ${watchedTokens} watched asset${watchedTokens === 1 ? "" : "s"} monitored, top Sentinel rank ${topLevel}. ${mother?.confidence ?? 70}% oversight confidence.`;
}

export function buildMotherDailyReport(
  sentinels: SyntheticSentinel[],
  signals: SentinelSignals,
): MotherDailyReport {
  const mother = sentinels.find((s) => s.isMother);
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
    headline: `${mother?.name ?? "Mother"} is online. Sentinel discipline is ${oversightGrade}-grade.`,
    daySummary:
      watchedAssets > 0
        ? `${watchedAssets} watched asset${watchedAssets === 1 ? "" : "s"} tracked, ${activeAlerts} alert stream${activeAlerts === 1 ? "" : "s"} reviewed, and ${signals.reportCount} hive report${signals.reportCount === 1 ? "" : "s"} folded into memory.`
        : "No watched assets yet. Mother is standing by in demo mode and waiting for the hive to feed Nexus reports.",
    priorities: [
      activeAlerts > 0
        ? "Review active alerts and confirm whether each warning was useful."
        : "Add tokens to your watchlist so Nexus Sentinels can start building memory.",
      signals.reportCount > 0
        ? "Keep collecting community reports so Whale Sentinel can strengthen scam-pattern memory."
        : "Use report buttons on suspicious tokens to train Whale Sentinel and Mother.",
      topSentinel
        ? `${topSentinel.name} is leading today at level ${topSentinel.level}. Feed it more signals to push toward ${topSentinel.levelName}.`
        : "Launch demo mode to wake the Sentinels and generate a training baseline.",
    ],
    closingNote:
      mood === "High Guard"
        ? "Mother recommends staying defensive today. The hive is seeing enough activity to keep shields hot."
        : mood === "Alert"
          ? "Mother sees movement worth watching. Keep the Sentinels fed and verify anything suspicious."
          : "Mother reports a calm grid. Good day to train the hive and prepare stronger alerts.",
  };
}
