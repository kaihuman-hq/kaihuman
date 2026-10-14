import { newStreamId, streamLabels } from '@kaihuman/formats';
import { useEffect } from 'preact/hooks';
import { buildInbox, unreadKeys } from '../background/work/inbox.js';
import type { OrgAccessProblem, WorkProblem } from '../background/work/types.js';
import { CONSOLE_URL, consoleFileUrl } from '../console.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { InboxSection, MineSection } from './InboxSection.js';
import { StreamSection } from './StreamSection.js';
import { ThisTabBar } from './ThisTabBar.js';
import { updateWorkUi, useWorkState } from './useWorkState.js';
import { WorkSettings } from './WorkSettings.js';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

export { age };

export function SidePanel() {
  const { snapshot, streams, dismissed, saveError, queueLength, ui, loaded } = useWorkState();

  useEffect(() => {
    // Opening the port tells the worker the panel is visible so it polls faster.
    const port = chrome.runtime.connect({ name: 'work-panel' });
    return () => port.disconnect();
  }, []);

  const shell = 'w-[360px] max-w-full min-h-screen bg-[#050505] text-[#e6e6e6] p-3';
  if (!loaded) return <main class={shell} />;

  // A missing streams cache only hides the streams; the worker polls with a work token alone.
  const signedOut = snapshot ? snapshot.problem?.kind === 'signed-out' : !streams;
  const file = streams?.state.ok ? streams.state.file : null;
  const inbox = snapshot ? buildInbox(snapshot, file, dismissed) : undefined;
  const unread = snapshot ? unreadKeys(snapshot) : new Set<string>();
  const readOnly = streams ? !streams.state.ok : false;

  const addStream = () => {
    const name = window.prompt('Name of the new stream')?.trim();
    if (!name) return;
    void send({
      type: 'WORK_OPS',
      ops: [{ op: 'addStream', streamId: newStreamId(), name, at: new Date().toISOString() }],
    }).catch(() => {});
  };
  const labels = file ? streamLabels(file) : [];
  const label = ui.label !== undefined && labels.includes(ui.label) ? ui.label : undefined;

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
          {inbox && (
            <>
              <InboxSection
                title="Waiting on you"
                rows={inbox.waiting}
                file={file}
                readOnly={readOnly}
              />
              <InboxSection
                title="New activity"
                rows={inbox.activity}
                file={file}
                readOnly={readOnly}
              />
              <MineSection
                title="My open PRs"
                prs={inbox.mine}
                file={file}
                readOnly={readOnly}
                unread={unread}
              />
            </>
          )}
          {file && (
            <>
              <div class="flex items-center gap-2">
                <select
                  class="flex-1 bg-[#050505] text-[12px] text-[#999]"
                  aria-label="Filter by label"
                  value={label ?? ''}
                  onChange={(event) =>
                    void updateWorkUi({ label: event.currentTarget.value || undefined })
                  }
                >
                  <option value="">all</option>
                  {labels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button type="button" class="border border-[#333] px-2" onClick={addStream}>
                  + New stream
                </button>
              </div>
              {file.streams.map((stream, index) => (
                <StreamSection
                  key={stream.id}
                  stream={stream}
                  index={index}
                  count={file.streams.length}
                  statuses={snapshot?.pinned ?? {}}
                  threads={snapshot?.threads}
                  unread={unread}
                  label={label}
                  collapsed={ui.collapsed.includes(stream.id)}
                  readOnly={readOnly}
                  streams={file.streams}
                />
              ))}
            </>
          )}
        </>
      )}
      <WorkSettings />
    </main>
  );
}
