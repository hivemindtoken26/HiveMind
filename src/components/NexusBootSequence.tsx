import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const PHASE_COPY: readonly string[] = [
  "NEXUS INITIALIZING",
  "Mother Core: Platform intelligence online",
  "Sentinels synchronizing...",
  "Market intelligence connected.",
  "ENTER THE NEXUS",
] as const;

const SENTINELS = [
  { name: "Sentinel Aegis", role: "Scam and risk detection." },
  { name: "Sentinel Pulse", role: "Momentum and trend analysis." },
  { name: "Sentinel Titan", role: "Whale wallet tracking." },
  { name: "Sentinel Cipher", role: "Pattern recognition and AI intelligence." },
] as const;

/**
 * Phase gaps (ms): 0→1, 1→2, 2→3, 3→4, hold on finale, exit animation before unmount.
 * Totals ≈ 3.1s active + 0.6s fade (reduced motion: ~1.2s).
 */
function getBootDurations(reduced: boolean): readonly number[] {
  return reduced
    ? ([140, 140, 140, 140, 200, 320] as const)
    : ([520, 880, 520, 520, 680, 600] as const);
}

type Props = {
  children: ReactNode;
};

export function NexusBootSequence({ children }: Props) {
  const [phase, setPhase] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (removed) return;

    const steps = [...getBootDurations(reducedMotion)];

    const clearAll = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };

    clearAll();

    let acc = 0;
    for (let p = 1; p <= 4; p += 1) {
      acc += steps[p - 1]!;
      const next = p;
      timersRef.current.push(setTimeout(() => setPhase(next), acc));
    }

    acc += steps[4]!;
    timersRef.current.push(
      setTimeout(() => {
        setExiting(true);
      }, acc),
    );

    acc += steps[5]!;
    timersRef.current.push(
      setTimeout(() => {
        setRemoved(true);
        clearAll();
      }, acc),
    );

    return clearAll;
  }, [removed, reducedMotion]);

  useEffect(() => {
    if (!removed) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [removed]);

  const title = PHASE_COPY[phase] ?? PHASE_COPY[0];
  const showSentinels = phase === 2 && !exiting;

  return (
    <>
      {children}
      {!removed ? (
        <div
          className={`nexus-boot${exiting ? " nexus-boot--exit" : ""}`}
          data-phase={phase}
          aria-busy={!removed}
        >
          <div className="nexus-boot__bg" />
          <div className="nexus-boot__grid" />
          <div className="nexus-boot__honeycomb" aria-hidden />
          <div className="nexus-boot__scan nexus-boot__scan--vertical" aria-hidden />
          <div className="nexus-boot__scan nexus-boot__scan--horizontal" aria-hidden />
          <div className="nexus-boot__vignette" aria-hidden />

          <div className="nexus-boot__particles" aria-hidden>
            {PARTICLE_SEEDS.map((seed) => (
              <span key={seed.i} className="nexus-boot__particle" style={seed.style} />
            ))}
          </div>

          <div className="nexus-boot__frame nexus-boot__frame--tl" aria-hidden />
          <div className="nexus-boot__frame nexus-boot__frame--br" aria-hidden />

          <div className="nexus-boot__center">
            <p className="nexus-boot__eyebrow">THE NEXUS</p>

            <div className="nexus-boot__title-wrap">
              <div className="nexus-boot__title-block" key={phase}>
                <h1 className="nexus-boot__title" aria-live="polite">
                  {title}
                </h1>
              </div>
              <div className="nexus-boot__title-glow" aria-hidden />
            </div>

            <div
              className={`nexus-boot__sentinels${showSentinels ? " nexus-boot__sentinels--visible" : ""}`}
              aria-hidden={!showSentinels}
            >
              <ul className="nexus-boot__sentinel-list">
                {SENTINELS.map((s, i) => (
                  <li key={s.name} className="nexus-boot__sentinel" style={{ animationDelay: `${i * 0.07}s` }}>
                    <span className="nexus-boot__sentinel-name">{s.name}</span>
                    <span className="nexus-boot__sentinel-role">{s.role}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="nexus-boot__pulse-ring" aria-hidden />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Fixed pseudo-random particle positions (no Math.random per render). */
const PARTICLE_SEEDS: { i: number; style: CSSProperties }[] = [
  { i: 0, style: { left: "8%", top: "18%", ["--nexus-d" as string]: "2.8s" } },
  { i: 1, style: { left: "22%", top: "72%", ["--nexus-d" as string]: "3.2s" } },
  { i: 2, style: { left: "78%", top: "14%", ["--nexus-d" as string]: "2.5s" } },
  { i: 3, style: { opacity: 0.85, left: "88%", top: "48%", ["--nexus-d" as string]: "3.6s" } },
  { i: 4, style: { left: "45%", top: "8%", ["--nexus-d" as string]: "2.9s" } },
  { i: 5, style: { left: "62%", top: "82%", ["--nexus-d" as string]: "3.1s" } },
  { i: 6, style: { left: "15%", top: "44%", ["--nexus-d" as string]: "3.4s" } },
  { i: 7, style: { left: "92%", top: "28%", ["--nexus-d" as string]: "2.7s" } },
];
