import { useState } from 'react';
export function HonestyBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return <aside className="honesty"><span>This is a pure-TypeScript interpreter for a small user-mode subset (integer A64, ~40 syscalls, no dyld shared cache, no FP/SIMD, no real iOS frameworks). Real App Store / iOS binaries will not run — see <a href="https://github.com/CommunityPokeOrg/darwin-wasm/blob/main/docs/LIMITATIONS.md" target="_blank" rel="noreferrer">Limitations</a>.</span><button onClick={() => setVisible(false)} aria-label="Dismiss">×</button></aside>;
}
