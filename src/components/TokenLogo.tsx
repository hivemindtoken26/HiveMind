import { useState } from "react";
import type { Token } from "../data/tokens";
import { resolveTokenLogoUrl } from "../lib/tokenLogo";

type Props = {
  token: Token;
  size?: "sm" | "md";
  className?: string;
};

export function TokenLogo({ token, size = "sm", className = "" }: Props) {
  const [broken, setBroken] = useState(false);
  const src = resolveTokenLogoUrl(token);
  const rootClass = ["token-logo", size === "md" ? "token-logo--md" : "token-logo--sm", className].filter(Boolean).join(" ");

  if (!src || broken) {
    return (
      <div className={`${rootClass} token-logo--fallback`.trim()} aria-hidden>
        {token.symbol.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      className={rootClass}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
