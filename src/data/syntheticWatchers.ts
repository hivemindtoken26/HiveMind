export type WatcherLevelName = "Scout" | "Sentinel" | "Guardian" | "Oracle" | "Hive Core";

export type SyntheticWatcher = {
  id: string;
  name: string;
  role: string;
  level: number;
  levelName: WatcherLevelName;
  xp: number;
  nextLevelXp: number;
  confidence: number;
  status: string;
  lesson: string;
  accent: "green" | "gold" | "danger";
  isNeo?: boolean;
};

type WatcherSignals = {
  watchlistCount: number;
  alertCount: number;
  trackedCount: number;
  reportCount: number;
  plan: "FREE" | "BASIC" | "PRO";
};

export type NeoDailyReport = {
  mood: "Calm" | "Alert" | "High Guard";
  systemHealth: number;
  oversightGrade: "A" | "B" | "C";
  headline: string;
  daySummary: string;
  priorities: string[];
  closingNote: string;
};

const LEVELS: WatcherLevelName[] = ["Scout", "Sentinel", "Guardian", "Oracle", "Hive Core"];
const XP_PER_LEVEL = 140;

const watcherSeeds = [
  {
    id: "neo",
    name: "NEO",
    role: "Overseer of the Watchers",
    baseXp: 180,
    status: "Auditing every Watcher for accuracy, drift, and missed alerts.",
    lesson: "NEO learns from the whole hive and reports the day back to you.",
    accent: "gold" as const,
    isNeo: true,
  },
  {
    id: "scout",
    name: "Scout",
    role: "New-token scanner",
    baseXp: 40,
    status: "Searching for early movement and fresh suspicious launches.",
    lesson: "Learning which early patterns become real risk.",
    accent: "green" as const,
  },
  {
    id: "sentinel",
    name: "Sentinel",
    role: "Liquidity and wallet guard",
    baseXp: 78,
    status: "Watching liquidity depth, whale concentration, and fast exits.",
    lesson: "Learning from tokens with unstable liquidity and holder clusters.",
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
    id: "warden",
    name: "Warden",
    role: "Community report enforcer",
    baseXp: 92,
    status: "Weighing hive reports and repeated scam categories.",
    lesson: "Learning from what the community confirms or rejects.",
    accent: "danger" as const,
  },
];

function getLevelName(level: number): WatcherLevelName {
  return LEVELS[Math.min(level - 1, LEVELS.length - 1)];
}

function scoreSignals(signals: WatcherSignals) {
  const planBoost = signals.plan === "PRO" ? 90 : signals.plan === "BASIC" ? 45 : 0;
  return (
    signals.watchlistCount * 18 +
    signals.alertCount * 24 +
    signals.trackedCount * 20 +
    signals.reportCount * 30 +
    planBoost
  );
}

export function buildSyntheticWatchers(signals: WatcherSignals): SyntheticWatcher[] {
  const signalXp = scoreSignals(signals);

  return watcherSeeds.map((watcher, index) => {
    const xp = watcher.baseXp + signalXp + index * 17;
    const level = Math.min(5, Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1));
    const nextLevelXp = level >= 5 ? xp : level * XP_PER_LEVEL;
    const confidence = Math.min(97, 54 + level * 7 + signals.alertCount * 2 + signals.reportCount);

    return {
      ...watcher,
      level,
      levelName: getLevelName(level),
      xp,
      nextLevelXp,
      confidence,
    };
  });
}

export function buildNeoBriefing(watchers: SyntheticWatcher[], signals: WatcherSignals): string {
  const neo = watchers.find((watcher) => watcher.isNeo);
  const activeAlerts = signals.alertCount;
  const watchedTokens = signals.watchlistCount + signals.trackedCount;
  const topLevel = Math.max(...watchers.map((watcher) => watcher.level));

  return `NEO report: ${activeAlerts} alert signal${activeAlerts === 1 ? "" : "s"} reviewed, ${watchedTokens} watched asset${watchedTokens === 1 ? "" : "s"} monitored, top Watcher level ${topLevel}. ${neo?.confidence ?? 70}% oversight confidence.`;
}

export function buildNeoDailyReport(
  watchers: SyntheticWatcher[],
  signals: WatcherSignals,
): NeoDailyReport {
  const neo = watchers.find((watcher) => watcher.isNeo);
  const averageConfidence = Math.round(
    watchers.reduce((total, watcher) => total + watcher.confidence, 0) / watchers.length,
  );
  const activeAlerts = signals.alertCount;
  const watchedAssets = signals.watchlistCount + signals.trackedCount;
  const mood =
    activeAlerts >= 4 ? "High Guard" : activeAlerts >= 1 || signals.reportCount >= 2 ? "Alert" : "Calm";
  const systemHealth = Math.min(99, Math.max(55, averageConfidence + signals.trackedCount * 2));
  const oversightGrade = systemHealth >= 86 ? "A" : systemHealth >= 72 ? "B" : "C";
  const topWatcher = watchers
    .filter((watcher) => !watcher.isNeo)
    .sort((a, b) => b.level - a.level || b.confidence - a.confidence)[0];

  return {
    mood,
    systemHealth,
    oversightGrade,
    headline: `${neo?.name ?? "NEO"} is online. Watcher discipline is ${oversightGrade}-grade.`,
    daySummary:
      watchedAssets > 0
        ? `${watchedAssets} watched asset${watchedAssets === 1 ? "" : "s"} tracked, ${activeAlerts} alert stream${activeAlerts === 1 ? "" : "s"} reviewed, and ${signals.reportCount} hive report${signals.reportCount === 1 ? "" : "s"} folded into memory.`
        : "No watched assets yet. NEO is standing by in demo mode and waiting for the hive to feed it reports.",
    priorities: [
      activeAlerts > 0
        ? "Review active alerts and confirm whether each warning was useful."
        : "Add tokens to the watchlist so the Watchers can start building memory.",
      signals.reportCount > 0
        ? "Keep collecting community reports so Warden can strengthen scam-pattern memory."
        : "Use report buttons on suspicious tokens to train Warden and NEO.",
      topWatcher
        ? `${topWatcher.name} is leading today at level ${topWatcher.level}. Feed it more signals to push toward ${topWatcher.levelName}.`
        : "Launch demo mode to wake the Watchers and generate a training baseline.",
    ],
    closingNote:
      mood === "High Guard"
        ? "NEO recommends staying defensive today. The hive is seeing enough activity to keep shields hot."
        : mood === "Alert"
          ? "NEO sees movement worth watching. Keep the Watchers fed and verify anything suspicious."
          : "NEO reports a calm grid. Good day to train the hive and prepare stronger alerts.",
  };
}
