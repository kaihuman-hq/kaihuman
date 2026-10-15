import { newStreamId, type StreamId, streamLabels } from '@kaihuman/formats';
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { buildInbox, type InboxRow, unreadKeys } from '../background/work/inbox.js';
import type { OrgAccessProblem, WorkProblem } from '../background/work/types.js';
import { CONSOLE_URL, consoleFileUrl } from '../console.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { Choice, Heading, iconButton, NewStreamInput, sendOps } from './controls.js';
import { InboxSection, MineSection, useTldrs } from './InboxSection.js';
import { RelatedPicker } from './RelatedPicker.js';
import { StreamSection } from './StreamSection.js';
import { ThisTabBar } from './ThisTabBar.js';
import { useInboxLabels } from './useInboxLabels.js';
import { useAutoFileInbox } from './useSuggestion.js';
import { updateWorkUi, useWorkState } from './useWorkState.js';
import { WorkSettings } from './WorkSettings.js';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const link = 'underline decoration-nt-faint underline-offset-2 hover:text-nt-accent';
const banner =
  'border-l-2 border-nt-int bg-nt-row-hover px-3 py-2 text-[12px] [overflow-wrap:anywhere]';

function ProblemBanner({
  problem,
  fetchedAt,
  workTokenSet,
}: {
  problem: WorkProblem;
  fetchedAt?: number;
  workTokenSet: boolean;
}) {
  switch (problem.kind) {
    case 'auth':
      // The work token is what polls when it is set, so signing in again would not help.
      return (
        <p class={banner}>
          {workTokenSet
            ? 'GitHub refused the work token. Update it in Settings.'
            : 'GitHub refused the token. Sign in again.'}
        </p>
      );
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

/** Every stream under one heading, with the label filter and new streams kept in place. */
function Streams({
  state,
  unread,
  rows,
}: {
  state: ReturnType<typeof useWorkState>;
  unread: Set<string>;
  rows: InboxRow[];
}) {
  const { file, snapshot, ui, streams } = state;
  const [adding, setAdding] = useState(false);
  const [growing, setGrowing] = useState<StreamId>();
  if (!file) return null;
  const readOnly = streams ? !streams.state.ok : false;
  const labels = streamLabels(file);
  const label = ui.label !== undefined && labels.includes(ui.label) ? ui.label : undefined;
  const add = (name: string) => {
    setAdding(false);
    const streamId = newStreamId();
    sendOps([{ op: 'addStream', streamId, name, at: new Date().toISOString() }]);
    // A new stream is empty: offer the tabs and items that already belong with it.
    setGrowing(streamId);
  };
  return (
    <section class="flex flex-col gap-2">
      <Heading title="Streams" count={file.streams.length}>
        <button
          type="button"
          class="shrink-0 text-[12px] text-nt-muted hover:text-nt-accent disabled:opacity-40"
          aria-expanded={adding}
          disabled={readOnly}
          onClick={() => setAdding(!adding)}
        >
          + New stream
        </button>
      </Heading>
      {adding && <NewStreamInput onCreate={add} onCancel={() => setAdding(false)} />}
      {labels.length > 0 && (
        <fieldset class="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0">
          <legend class="sr-only">Filter by label</legend>
          <Choice
            selected={label === undefined}
            onClick={() => void updateWorkUi({ label: undefined })}
          >
            All
          </Choice>
          {labels.map((name) => (
            <Choice
              key={name}
              title={name}
              selected={label === name}
              onClick={() => void updateWorkUi({ label: label === name ? undefined : name })}
            >
              {name}
            </Choice>
          ))}
        </fieldset>
      )}
      {file.streams.length === 0 && !adding && (
        <p class="text-[12px] text-nt-faint">
          No streams yet. Pin the open tab above, or add a stream for a piece of work.
        </p>
      )}
      <div class="flex flex-col gap-1">
        {file.streams.map((stream, index) => (
          <Fragment key={stream.id}>
            <StreamSection
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
              onFindRelated={() => setGrowing(stream.id)}
            />
            {growing === stream.id && (
              <RelatedPicker
                stream={stream}
                file={file}
                rows={rows}
                onClose={() => setGrowing(undefined)}
              />
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function SidePanel() {
  const state = useWorkState();
  const { snapshot, streams, file, dismissed, saveError, queueLength, workTokenSet, ui, loaded } =
    state;
  const [settings, setSettings] = useState(false);
  const { labels, assigned, muted } = useInboxLabels();
  const [labelFilter, setLabelFilter] = useState<string>();
  const tldrs = useTldrs(snapshot?.fetchedAt);

  useEffect(() => {
    // Opening the port tells the worker the panel is visible so it polls faster. A restarted
    // worker drops the port and forgets the panel, so it is opened again.
    let live = true;
    let port: chrome.runtime.Port;
    const connect = () => {
      port = chrome.runtime.connect({ name: 'work-panel' });
      port.onDisconnect.addListener(() => {
        if (live) connect();
      });
    };
    connect();
    return () => {
      live = false;
      port.disconnect();
    };
  }, []);

  const inbox = snapshot ? buildInbox(snapshot, file, dismissed, new Date(), muted) : undefined;
  const readOnly = streams ? !streams.state.ok : false;
  useAutoFileInbox(inbox?.waiting, file, ui.autoFileInbox === true && !readOnly);

  const shell = 'min-h-screen w-full bg-nt-bg font-nt text-[13px] text-nt-fg antialiased';
  if (!loaded) return <main class={shell} />;

  // A missing streams cache only hides the streams; the worker polls with a work token alone.
  const signedOut = snapshot ? snapshot.problem?.kind === 'signed-out' : !streams;
  const unread = snapshot ? unreadKeys(snapshot) : new Set<string>();
  // A filter whose label was since removed would hide everything with no chip to clear it.
  const chipLabels = labels.filter((l) => !l.mute);
  const filter = chipLabels.some((l) => l.name === labelFilter) ? labelFilter : undefined;
  const byLabel = (rows: InboxRow[]) =>
    filter ? rows.filter((row) => assigned[row.key] === filter) : rows;

  return (
    <main class={`${shell} flex flex-col`}>
      <header class="sticky top-0 z-10 flex items-center gap-1 border-b border-nt-divider bg-nt-bg px-3 py-2">
        <h1 class="flex-1 text-[14px] font-bold">Work</h1>
        {snapshot && (
          <span class="pr-1 text-[11px] text-nt-faint" title="Last checked">
            {age(snapshot.fetchedAt)}
          </span>
        )}
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          class={iconButton}
          onClick={() => void send({ type: 'WORK_REFRESH' }).catch(() => {})}
        >
          ↻
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          aria-expanded={settings}
          class={`${iconButton} ${settings ? 'text-nt-accent' : ''}`}
          onClick={() => setSettings(!settings)}
        >
          ⚙
        </button>
      </header>
      {settings && <WorkSettings ui={ui} />}
      <div class="flex flex-col gap-5 px-3 py-3">
        {signedOut ? (
          <p class="text-[13px] leading-5">
            Sign in to kaihuman in the console to see your work.{' '}
            <a class={link} href={CONSOLE_URL} target="_blank" rel="noreferrer">
              Open the console
            </a>
          </p>
        ) : (
          <>
            {(snapshot?.problem ||
              readOnly ||
              saveError ||
              (snapshot?.orgProblems.length ?? 0) > 0) && (
              <div class="flex flex-col gap-1.5">
                {snapshot?.problem && (
                  <ProblemBanner
                    problem={snapshot.problem}
                    fetchedAt={snapshot.fetchedAt}
                    workTokenSet={workTokenSet}
                  />
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
                  <p class={`${banner} border-nt-prod`}>
                    {queueLength > 0
                      ? `Not saved yet: ${saveError}`
                      : `Could not apply a change: ${saveError}`}
                  </p>
                )}
                {snapshot?.orgProblems.map((problem) => (
                  <OrgBanner key={problem.org} problem={problem} />
                ))}
              </div>
            )}
            <ThisTabBar file={file} ui={ui} readOnly={readOnly} />
            {inbox && (
              <div class="flex flex-col gap-4">
                {chipLabels.length > 0 && (
                  <fieldset class="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0">
                    <legend class="sr-only">Filter inbox by label</legend>
                    <Choice
                      selected={filter === undefined}
                      onClick={() => setLabelFilter(undefined)}
                    >
                      All
                    </Choice>
                    {chipLabels.map(({ name }) => (
                      <Choice
                        key={name}
                        title={name}
                        selected={filter === name}
                        onClick={() => setLabelFilter(filter === name ? undefined : name)}
                      >
                        {name}
                      </Choice>
                    ))}
                  </fieldset>
                )}
                <InboxSection
                  title="Waiting on you"
                  rows={byLabel(inbox.waiting)}
                  labels={assigned}
                  file={file}
                  readOnly={readOnly}
                  tldrs={tldrs}
                />
                <InboxSection
                  title="New activity"
                  rows={byLabel(inbox.activity)}
                  labels={assigned}
                  file={file}
                  readOnly={readOnly}
                  tldrs={tldrs}
                />
                <MineSection
                  title="My open PRs"
                  prs={inbox.mine}
                  file={file}
                  readOnly={readOnly}
                  unread={unread}
                />
              </div>
            )}
            <Streams
              state={state}
              unread={unread}
              rows={inbox ? [...inbox.waiting, ...inbox.activity] : []}
            />
          </>
        )}
      </div>
    </main>
  );
}
