import { StatusBar } from '@lifosy/ui';
import { ArrowLeft, ExternalLink, Share2, Smartphone } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { route } from 'preact-router';

// ─── Quick-route registry ─────────────────────────────────────────────────────
// Add new quick routes here. The shortcuts page and Android manifest shortcuts
// should be kept in sync.

export interface QuickRoute {
  name: string;
  path: string;
  /** Suggested home-screen bookmark name for iOS */
  suggestedName: string;
  description: string;
}

export const QUICK_ROUTES: QuickRoute[] = [
  {
    name: 'Quick Todo',
    path: '/quick-todo',
    suggestedName: 'KH Inbox',
    description: 'Capture a task directly to your inbox',
  },
  {
    name: 'Quick Note',
    path: '/quick-note',
    suggestedName: 'KH Note',
    description: 'Capture a quick thought to your notes',
  },
  {
    name: 'Quick Knowledge',
    path: '/quick-knowledge',
    suggestedName: 'KH Learn',
    description: 'Capture something you learned to your knowledge base inbox',
  },
  {
    name: 'Quick Log',
    path: '/quick-log',
    suggestedName: 'KH Log',
    description: 'Capture a timestamped action log entry to your inbox',
  },
  {
    name: 'New File',
    path: '/new',
    suggestedName: 'KH New',
    description: 'Open a blank editor and create a new file',
  },
  {
    name: 'Knowledge Base',
    path: '/knowledge',
    suggestedName: 'KH Knowledge',
    description: 'Pin, browse, and query your AI knowledge base',
  },
];

// ─── Platform detection ───────────────────────────────────────────────────────

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const PLATFORM_LABELS: Record<Platform, string> = {
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
};

// ─── Step components ──────────────────────────────────────────────────────────

const Step = ({ n, children }: { n: number; children: preact.ComponentChildren }) => (
  <div class="flex gap-3 items-start">
    <span class="shrink-0 w-5 h-5 rounded-full border border-[var(--los-accent)]/40 text-[var(--los-accent)] text-[10px] font-mono font-bold flex items-center justify-center">
      {n}
    </span>
    <span class="text-xs font-mono text-[var(--los-fg)] leading-relaxed">{children}</span>
  </div>
);

const Code = ({ children }: { children: string }) => (
  <span class="inline font-mono bg-[var(--los-accent)]/10 text-[var(--los-accent)] px-1 py-0.5 text-[11px]">
    {children}
  </span>
);

// ─── Per-platform instruction blocks ─────────────────────────────────────────

const IosInstructions = ({ r }: { r: QuickRoute }) => {
  const fullUrl = `${window.location.origin}${r.path}`;
  return (
    <div class="flex flex-col gap-2.5 pt-3 border-t border-[var(--los-border)]">
      <Step n={1}>
        Open Safari on your iPhone and navigate to{' '}
        <a
          href={fullUrl}
          class="text-[var(--los-accent)] underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          {fullUrl}
        </a>
      </Step>
      <Step n={2}>
        Tap the <Share2 size={11} class="inline mb-0.5" /> Share button at the bottom of Safari
      </Step>
      <Step n={3}>
        Scroll down and tap <Code>Add to Home Screen</Code>
      </Step>
      <Step n={4}>
        Set the name to <Code>{r.suggestedName}</Code> — this is what appears below the icon
      </Step>
      <Step n={5}>Tap Add. Done.</Step>
      <p class="text-[10px] text-[var(--los-muted)] leading-relaxed pl-8">
        All shortcuts share the same app icon (iOS limitation). The name is what differentiates them
        — make sure to set it in step 4.
      </p>
    </div>
  );
};

const AndroidInstructions = ({ r }: { r: QuickRoute }) => {
  const fullUrl = `${window.location.origin}${r.path}`;
  return (
    <div class="flex flex-col gap-2.5 pt-3 border-t border-[var(--los-border)]">
      <div class="text-[10px] font-mono text-[var(--los-accent)] uppercase tracking-widest mb-1">
        Option A — long-press the installed app icon
      </div>
      <Step n={1}>
        Find the <Code>kh</Code> icon on your home screen and long-press it
      </Step>
      <Step n={2}>
        A context menu appears — tap <Code>{r.name}</Code>
      </Step>
      <p class="text-[10px] text-[var(--los-muted)] leading-relaxed pl-8">
        This only works if you have already installed the app. The shortcuts are built into the
        installed app — no extra icon needed.
      </p>
      <div class="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest mt-2 mb-1">
        Option B — separate home screen icon
      </div>
      <Step n={1}>
        Open Chrome and navigate to{' '}
        <a
          href={fullUrl}
          class="text-[var(--los-accent)] underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          {fullUrl}
        </a>
      </Step>
      <Step n={2}>
        Tap the ⋮ menu → <Code>Add to Home screen</Code>
      </Step>
      <Step n={3}>
        Name it <Code>{r.suggestedName}</Code> and confirm
      </Step>
    </div>
  );
};

const DesktopInstructions = ({ r }: { r: QuickRoute }) => {
  const fullUrl = `${window.location.origin}${r.path}`;
  return (
    <div class="flex flex-col gap-2.5 pt-3 border-t border-[var(--los-border)]">
      <Step n={1}>
        Bookmark{' '}
        <a
          href={fullUrl}
          class="text-[var(--los-accent)] underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          {fullUrl}
        </a>{' '}
        in your browser
      </Step>
      <Step n={2}>Or pin it to your browser toolbar for one-click access</Step>
    </div>
  );
};

// ─── Route card ───────────────────────────────────────────────────────────────

const RouteCard = ({ r, platform }: { r: QuickRoute; platform: Platform }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div class="border border-[var(--los-border)] flex flex-col">
      {/* Summary row */}
      <div class="flex items-center gap-3 px-4 py-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-mono font-bold text-[var(--los-fg)]">{r.name}</span>
            <a
              href={r.path}
              onClick={(e) => {
                e.preventDefault();
                route(r.path);
              }}
              class="text-[9px] font-mono text-[var(--los-muted)] hover:text-[var(--los-accent)] flex items-center gap-0.5 transition-colors"
            >
              {r.path}
              <ExternalLink size={8} />
            </a>
          </div>
          <p class="text-[11px] font-mono text-[var(--los-muted)] mt-0.5">{r.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          class="shrink-0 text-[10px] font-mono border border-[var(--los-border)] px-2 py-1 text-[var(--los-muted)] hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors whitespace-nowrap"
        >
          {expanded ? 'HIDE' : 'HOW TO ADD'}
        </button>
      </div>

      {expanded && (
        <div class="px-4 pb-4">
          {platform === 'ios' && <IosInstructions r={r} />}
          {platform === 'android' && <AndroidInstructions r={r} />}
          {platform === 'desktop' && <DesktopInstructions r={r} />}
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ShortcutsPage = () => {
  const detected = detectPlatform();
  const [platform, setPlatform] = useState<Platform>(detected);

  return (
    <>
      <div class="h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] font-mono overflow-hidden">
        {/* Header */}
        <div class="h-14 border-b border-[var(--los-border)] flex items-center gap-4 px-6 shrink-0">
          <button
            type="button"
            onClick={() => route('/')}
            class="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            <ArrowLeft size={14} />
            <span class="text-xs font-mono">BACK</span>
          </button>
          <div class="h-4 w-px bg-[var(--los-border)]" />
          <Smartphone size={13} class="text-[var(--los-accent)]" />
          <span class="text-sm font-mono font-bold tracking-widest text-[var(--los-accent)]">
            SHORTCUTS
          </span>
        </div>

        {/* Body */}
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
            {/* Intro */}
            <div class="flex flex-col gap-2">
              <p class="text-xs font-mono text-[var(--los-muted)] leading-relaxed">
                Add quick-capture shortcuts to your home screen for instant access — no need to open
                the full app first.
              </p>
            </div>

            {/* Platform picker */}
            <div class="flex flex-col gap-2">
              <span class="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest">
                Platform
                {detected !== platform && (
                  <button
                    type="button"
                    onClick={() => setPlatform(detected)}
                    class="ml-2 normal-case text-[var(--los-accent)] hover:underline"
                  >
                    (reset to detected)
                  </button>
                )}
              </span>
              <div class="flex gap-2">
                {(['ios', 'android', 'desktop'] as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    class={`text-[10px] font-mono px-3 py-1 border transition-colors ${
                      platform === p
                        ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                        : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]'
                    }`}
                  >
                    {PLATFORM_LABELS[p]}
                    {p === detected && <span class="ml-1 opacity-50 text-[8px]">← detected</span>}
                  </button>
                ))}
              </div>

              {platform === 'android' && (
                <p class="text-[10px] font-mono text-[var(--los-muted)] leading-relaxed">
                  On Android, long-press the installed <span class="text-[var(--los-fg)]">kh</span>{' '}
                  icon to access all shortcuts directly — no separate icons needed.
                </p>
              )}
            </div>

            {/* Route cards */}
            <div class="flex flex-col gap-3">
              <span class="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest">
                Available shortcuts
              </span>
              {QUICK_ROUTES.map((r) => (
                <RouteCard key={r.path} r={r} platform={platform} />
              ))}
            </div>

            {/* iOS note about icons */}
            {platform === 'ios' && (
              <div class="border border-[var(--los-border)] px-4 py-3 flex flex-col gap-1.5">
                <span class="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest">
                  About icons on iOS
                </span>
                <p class="text-[11px] font-mono text-[var(--los-muted)] leading-relaxed">
                  iOS uses the same app icon for all bookmarks from the same site — this is an iOS
                  limitation. The <span class="text-[var(--los-fg)]">name</span> below the icon is
                  what differentiates your shortcuts, so make sure to set the suggested name when
                  adding each one.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <StatusBar
        mode="SHORTCUTS"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/board')}
      />
    </>
  );
};
