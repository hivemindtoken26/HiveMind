import type { Token } from "../data/tokens";

/** DexScreener-hosted token image for a Solana mint (works when on-chain metadata has an icon). */
export function resolveTokenLogoUrl(
  token: Pick<Token, "logoUrl" | "mintAddress">,
): string | undefined {
  const fromApi = token.logoUrl?.trim();
  if (fromApi?.startsWith("http")) return fromApi;
  const mint = token.mintAddress?.trim();
  if (mint) {
    return `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`;
  }
  return undefined;
}
