import { StatusBar } from '@lifosy/ui';
import { ArrowLeft, BookOpen } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { route } from 'preact-router';
import { KB_SKILL_VERSION } from '../lib/kb-skills';

// ─── Tiny presentational helpers (match the console's mono/token styling) ──────

const Code = ({ children }: { children: string }) => (
  <span class="inline font-mono bg-[var(--los-accent)]/10 text-[var(--los-accent)] px-1 py-0.5 text-[11px] rounded">
    {children}
  </span>
);

const Section = ({ title, children }: { title: string; children: preact.ComponentChildren }) => (
  <div class="flex flex-col gap-2">
    <h3 class="text-[10px] font-mono text-[var(--los-muted)] uppercase tracking-widest">{title}</h3>
    <div class="flex flex-col gap-2 text-xs font-mono text-[var(--los-fg)] leading-relaxed">
      {children}
    </div>
  </div>
);

const Step = ({ n, children }: { n: number; children: preact.ComponentChildren }) => (
  <div class="flex gap-3 items-start">
    <span class="shrink-0 w-5 h-5 rounded-full border border-[var(--los-accent)]/40 text-[var(--los-accent)] text-[10px] font-mono font-bold flex items-center justify-center">
      {n}
    </span>
    <span class="text-xs font-mono text-[var(--los-fg)] leading-relaxed">{children}</span>
  </div>
);

const KeyRow = ({ keys, label }: { keys: string; label: string }) => (
  <div class="flex items-center gap-3 py-1 border-b border-[var(--los-border)]/50">
    <span class="shrink-0 min-w-[7rem] font-mono text-[11px] text-[var(--los-accent)]">{keys}</span>
    <span class="text-[11px] text-[var(--los-fg-dim)]">{label}</span>
  </div>
);

const CmdRow = ({ cmd, label }: { cmd: string; label: string }) => (
  <div class="flex flex-col gap-0.5 py-1.5 border-b border-[var(--los-border)]/50">
    <span class="font-mono text-[11px] text-[var(--los-accent)]">{cmd}</span>
    <span class="text-[11px] text-[var(--los-fg-dim)] leading-relaxed">{label}</span>
  </div>
);

// ─── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'knowledge', label: 'Knowledge Base' },
  { id: 'capture', label: 'Quick Capture' },
  { id: 'cli', label: 'CLI Keys' },
  { id: 'commands', label: 'Slash Commands' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Tab content ───────────────────────────────────────────────────────────────

const KnowledgeTab = () => (
  <div class="flex flex-col gap-6">
    <p class="text-xs font-mono text-[var(--los-fg-dim)] leading-relaxed">
      The knowledge base lives in <Code>.kh/</Code> in your active repo. You capture freely; Claude
      Code compiles. Two invariants keep it trustworthy: <b>raw captures are immutable</b> and{' '}
      <b>the wiki is derived</b> — so a bad compile is always recoverable from git.
    </p>

    <Section title="The flow">
      <Step n={1}>
        <b>Capture</b> anything you learned — via the browser extension, the console (
        <Code>+ Add note</Code> or <Code>/quick-knowledge</Code>), or the CLI (<Code>k</Code>). It
        lands in <Code>.kh/raw/</Code> as one file with <Code>processed: false</Code>. No structure
        required.
      </Step>
      <Step n={2}>
        <b>Ingest</b> — run <Code>/kb-ingest</Code> in Claude Code. Each capture is appended
        verbatim to the monthly journal <Code>.kh/journal/YYYY-MM.md</Code> and synthesized into{' '}
        <Code>.kh/wiki/</Code> pages, then moved to <Code>.kh/raw/processed/</Code>.
      </Step>
      <Step n={3}>
        <b>Index</b> — run <Code>/kb-index</Code> to rebuild <Code>.kh/search.kb.json</Code> so
        answers stay fast and accurate.
      </Step>
      <Step n={4}>
        <b>Ask</b> — run <Code>/kb-ask &lt;question&gt;</Code>. It ranks wiki pages by the search
        index, reads the top matches, and answers with citations.
      </Step>
      <Step n={5}>
        <b>Lint</b> — run <Code>/kb-lint</Code> now and then to fix orphans, dead links, missing
        sources, and near-duplicate pages.
      </Step>
    </Section>

    <Section title="Journal vs. wiki">
      <p>
        The <b>journal</b> (<Code>.kh/journal/YYYY-MM.md</Code>) is the human-readable log: one{' '}
        <Code># YYYY-MM</Code> heading, then a <Code>## [YYYY-MM-DD HH:MM] Title</Code> section per
        capture, body verbatim. The <b>wiki</b> is the synthesized, deduplicated view built from it.
        Read the journal to remember <i>what you wrote</i>; read the wiki to see{' '}
        <i>what it means</i>.
      </p>
    </Section>

    <Section title="Why you can trust it">
      <p>
        Every wiki page carries a <Code>## Sources</Code> section linking each claim back to its
        journal entry or raw capture. That provenance lets you verify the synthesis against what you
        actually captured. Ingestion prefers merging into existing <b>Canonical Topics</b> (listed
        in <Code>.kh/schema.md</Code>) rather than spawning near-duplicate pages.
      </p>
    </Section>

    <Section title="Automate it">
      <p>
        <Code>/kb-ingest</Code> + <Code>/kb-index</Code> are safe to run on a schedule (a routine or
        cron) for hands-off upkeep. Because raw captures never change and the wiki is rebuildable,
        git history is your undo — review the diff periodically.
      </p>
    </Section>

    <div class="flex flex-wrap gap-2 pt-2">
      <button
        type="button"
        onClick={() => route('/knowledge')}
        class="px-3 py-1.5 bg-[var(--los-accent)] text-black font-bold text-xs rounded hover:opacity-90"
      >
        Open Knowledge Base →
      </button>
      <button
        type="button"
        onClick={() => route('/wiki')}
        class="px-3 py-1.5 border border-[var(--los-border)] text-[var(--los-fg)] text-xs rounded hover:border-[var(--los-accent)]"
      >
        Browse Wiki →
      </button>
    </div>
    <p class="text-[10px] text-[var(--los-muted)]">KB skills v{KB_SKILL_VERSION}</p>
  </div>
);

const CaptureTab = () => (
  <div class="flex flex-col gap-6">
    <p class="text-xs font-mono text-[var(--los-fg-dim)] leading-relaxed">
      Capture happens wherever you already are. Everything below writes to the same knowledge inbox
      (<Code>.kh/raw/</Code>) and is picked up by <Code>/kb-ingest</Code>.
    </p>
    <Section title="Ways to capture">
      <CmdRow cmd="CLI · k" label="New knowledge note from the terminal TUI → .kh/raw/" />
      <CmdRow
        cmd="Hyprland · Super+K"
        label="Desktop overlay (wofi/fuzzel) → cli capture → .kh/raw/. Offline-safe; see apps/cli/scripts."
      />
      <CmdRow
        cmd="cli capture"
        label="Headless capture: args, piped stdin, or $EDITOR. Spools locally, then pushes with retry."
      />
      <CmdRow
        cmd="/quick-knowledge"
        label="One-tap mobile/desktop capture page. Add it to your home screen from Shortcuts."
      />
      <CmdRow
        cmd="Console · + Add note"
        label="Knowledge Base page → Inbox → Add note (title and tags optional)."
      />
      <CmdRow
        cmd="Browser extension"
        label="Pin the current article to the inbox with one click; images saved to .kh/assets/."
      />
    </Section>
    <Section title="Home-screen shortcuts">
      <p>
        Add <Code>/quick-knowledge</Code> (and the other quick pages) to your phone's home screen
        for instant capture.
      </p>
      <button
        type="button"
        onClick={() => route('/shortcuts')}
        class="self-start px-3 py-1.5 border border-[var(--los-border)] text-[var(--los-fg)] text-xs rounded hover:border-[var(--los-accent)]"
      >
        Set up shortcuts →
      </button>
    </Section>
  </div>
);

const CliTab = () => (
  <div class="flex flex-col gap-6">
    <p class="text-xs font-mono text-[var(--los-fg-dim)] leading-relaxed">
      Key bindings for the terminal app (<Code>cargo run</Code> in <Code>apps/cli</Code>).
    </p>
    <Section title="Main menu">
      <KeyRow keys="n" label="New quick note → active repo" />
      <KeyRow keys="k" label="New knowledge note → .kh/raw/ (compiled by /kb-ingest)" />
      <KeyRow keys="s" label="Select active repository" />
      <KeyRow keys="a" label="AI prompt — pipe to Claude / Copilot / Gemini" />
      <KeyRow keys="f" label="File browser (syncs repo first)" />
      <KeyRow keys="d" label="Dashboard config view" />
      <KeyRow keys="l" label="Login (GitHub OAuth)" />
      <KeyRow keys="q / Ctrl+C" label="Quit" />
    </Section>
    <Section title="Note & editor">
      <KeyRow keys="Enter" label="Save note · Esc cancels" />
      <KeyRow keys="Tab" label="AI prompt: cycle provider" />
      <KeyRow keys="Ctrl+S" label="File editor: save · Esc closes" />
    </Section>
  </div>
);

const CommandsTab = () => (
  <div class="flex flex-col gap-6">
    <p class="text-xs font-mono text-[var(--los-fg-dim)] leading-relaxed">
      Claude Code slash commands scaffolded into your repo under <Code>.claude/commands/</Code>.
    </p>
    <Section title="Knowledge base">
      <CmdRow
        cmd="/kb-ingest"
        label="Compile .kh/raw/ captures into the monthly journal + wiki, then archive them to processed/."
      />
      <CmdRow
        cmd="/kb-index"
        label="Rebuild .kh/search.kb.json (inverted keyword index) from all wiki pages. Run after every ingest."
      />
      <CmdRow
        cmd="/kb-ask <question> [--save]"
        label="Answer from the wiki with citations; --save files the answer back as a question page."
      />
      <CmdRow
        cmd="/kb-lint"
        label="Audit and repair: contradictions, stale claims, orphans, dead links, gaps — and suggest what to research next."
      />
      <CmdRow
        cmd="/kb-digest [period]"
        label="Summarize the repo's tracked personal data (habits, todos, action log…) into a raw source for ingestion."
      />
      <CmdRow
        cmd="/kb-session"
        label="Summarize the current Claude Code session and save it to the KB inbox."
      />
      <CmdRow
        cmd="/kb-agent-capture"
        label="Capture by driving the native kh-capture app via its automation server (experimental). Doubles as the app's acceptance test; falls back to cli capture."
      />
    </Section>
  </div>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export const CheatsheetPage = () => {
  const [tab, setTab] = useState<TabId>('knowledge');

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
          <BookOpen size={13} class="text-[var(--los-accent)]" />
          <span class="text-sm font-mono font-bold tracking-widest text-[var(--los-accent)]">
            CHEATSHEET
          </span>
        </div>

        {/* Tabs */}
        <nav class="flex gap-2 px-6 py-3 border-b border-[var(--los-border)] shrink-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              class={`px-3 py-1 rounded border text-xs whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                  : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-2xl mx-auto px-6 py-8">
            {tab === 'knowledge' && <KnowledgeTab />}
            {tab === 'capture' && <CaptureTab />}
            {tab === 'cli' && <CliTab />}
            {tab === 'commands' && <CommandsTab />}
          </div>
        </div>
      </div>

      <StatusBar
        mode="CHEATSHEET"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/board')}
        onWikiClick={() => route('/wiki')}
      />
    </>
  );
};
