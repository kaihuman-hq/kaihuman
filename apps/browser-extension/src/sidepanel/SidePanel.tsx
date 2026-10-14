import { useEffect } from 'preact/hooks';
import type { OrgAccessProblem, WorkProblem } from '../background/work/types.js';
import { CONSOLE_URL, consoleFileUrl } from '../console.js';
import { send } from '../palette/port.js';
import { ThisTabBar } from './ThisTabBar.js';
import { useWorkState } from './useWorkState.js';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "just now", "12m ago", "3h ago", "2d ago". */
export function age(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

const link = 'underline text-[#e6e6e6]';
const banner = 'border border-[#333] px-3 py-2 text-[13px]';

function ProblemBanner({ problem, fetchedAt }: { problem: WorkProblem; fetchedAt?: number }) {
  switch (problem.kind) {
    case 'auth':
      return <p class={banner}>GitHub refused the token. Sign in again.</p>;
    case 'rate-limit':
      return <p class={banner}>Paused by GitHub until {clock(problem.until)}.</p>;
    case 'offline':
      return (
        <p class={banner}>Offline — showing data as of {clock(fetchedAt ?? problem.retryAt)}.</p>
      );
    case 'signed-out':
      return null;
  }
}

function OrgBanner({ problem }: { problem: OrgAccessProblem }) {
  return (
    <p class={banner}>
      {problem.org} hides its items from kaihuman.{' '}
      <a class={link} href={problem.url} target="_blank" rel="noreferrer">
        {problem.fix === 'sso' ? 'Authorise SSO' : 'Request access'}
      </a>
    </p>
  );
}

export function SidePanel() {
  const { snapshot, streams, saveError, queueLength, ui, loaded } = useWorkState();

  useEffect(() => {
    // Opening the port tells the worker the panel is visible so it polls faster.
    const port = chrome.runtime.connect({ name: 'work-panel' });
    return () => port.disconnect();
  }, []);

  const shell = 'w-[360px] max-w-full min-h-screen bg-[#050505] text-[#e6e6e6] p-3';
  if (!loaded) return <main class={shell} />;

  const signedOut = !streams || snapshot?.problem?.kind === 'signed-out';
  const file = streams?.state.ok ? streams.state.file : null;
  const readOnly = streams ? !streams.state.ok : false;

  return (
    <main class={`${shell} flex flex-col gap-3 font-sans`}>
      <header class="flex items-center gap-2">
        <h1 class="text-[16px] font-bold flex-1">Work</h1>
        {snapshot && <span class="text-[12px] text-[#999]">{age(snapshot.fetchedAt)}</span>}
        <button
          type="button"
          aria-label="Refresh"
          class="px-2 text-[16px]"
          onClick={() => void send({ type: 'WORK_REFRESH' }).catch(() => {})}
        >
          ⟳
        </button>
      </header>
      {signedOut ? (
        <p class="text-[13px]">
          Sign in to kaihuman in the console to see your work.{' '}
          <a class={link} href={CONSOLE_URL} target="_blank" rel="noreferrer">
            Open the console
          </a>
        </p>
      ) : (
        <>
          {snapshot?.problem && (
            <ProblemBanner problem={snapshot.problem} fetchedAt={snapshot.fetchedAt} />
          )}
          {readOnly && (
            <p class={banner}>
              The streams file is not valid JSON, so it is read-only.{' '}
              <a
                class={link}
                href={consoleFileUrl('.kh/browser.streams.json', streams?.repo)}
                target="_blank"
                rel="noreferrer"
              >
                Open it in the console
              </a>
            </p>
          )}
          {saveError && (
            <p class={`${banner} text-red-400 break-words`}>
              {queueLength > 0
                ? `Not saved yet: ${saveError}`
                : `Could not apply a change: ${saveError}`}
            </p>
          )}
          {snapshot?.orgProblems.map((problem) => (
            <OrgBanner key={problem.org} problem={problem} />
          ))}
          <ThisTabBar file={file} ui={ui} readOnly={readOnly} />
        </>
      )}
    </main>
  );
}
