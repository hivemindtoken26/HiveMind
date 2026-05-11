const sentinelIdleMessages = [
  "Nexus Sentinels are observing liquidity flow across the hive.",
  "Nexus Sentinels are tracking volume spikes in real time.",
  "Nexus Sentinels are monitoring contract behavior for risk shifts.",
];

/** User-facing risk copy for Sentinel / Nexus intelligence. */
export function getSentinelMessage(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "safe") {
    return "The Sentinel sees no immediate threat.";
  }
  if (normalized === "warning") {
    return "The Sentinel detected unstable activity.";
  }
  if (normalized === "danger") {
    return "The Sentinel advises caution. Multiple risk signals detected.";
  }
  return "Nexus Sentinels are observing the network...";
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
