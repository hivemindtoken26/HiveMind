const sentinelIdleMessages = [
  "Sentinels are analyzing the market.",
  "The Nexus is scanning risk, momentum, whales, and patterns.",
  "Sentinels are observing liquidity flow across The Nexus.",
  "Sentinels are tracking volume spikes in real time.",
];

/** User-facing risk copy for Sentinel / Nexus intelligence. */
export function getSentinelMessage(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "safe") {
    return "Sentinels see no immediate threat.";
  }
  if (normalized === "warning") {
    return "Sentinels detected unstable activity.";
  }
  if (normalized === "danger") {
    return "Sentinels advise caution. Multiple risk signals detected.";
  }
  return "Sentinels are observing the network...";
}

export function getSentinelIdleMessage(seed: number): string {
  return sentinelIdleMessages[Math.abs(seed) % sentinelIdleMessages.length];
}

/** @deprecated Use getSentinelMessage */
export function getWatcherMessage(status: string): string {
  return getSentinelMessage(status);
}

/** @deprecated Use getSentinelIdleMessage */
export function getWatcherIdleMessage(seed: number): string {
  return getSentinelIdleMessage(seed);
}
