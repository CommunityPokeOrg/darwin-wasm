import type { UiStatus } from '../useMachine';
export function Header({ status, exitCode }: { status: UiStatus; exitCode?: number }) {
  const label = status === 'exited' ? `exited (${exitCode ?? 0})` : status;
  return <header className="topbar"><div><strong>darwin-wasm</strong><span>experimental AArch64 / Darwin user-mode runtime in the browser</span></div><nav><a href="https://github.com/CommunityPokeOrg/darwin-wasm" target="_blank" rel="noreferrer" aria-label="GitHub">GH</a><a href="https://github.com/CommunityPokeOrg/darwin-wasm/tree/main/docs" target="_blank" rel="noreferrer" aria-label="Docs">DOCS</a><b className={`status status-${status}`}>{label}</b></nav></header>;
}
