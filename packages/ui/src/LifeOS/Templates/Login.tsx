import {
  AlertTriangle,
  BookOpen,
  Github,
  GitMerge,
  Kanban,
  LayoutGrid,
  TrendingUp,
} from 'lucide-preact';
import { Logo } from '../Atoms/Logo';

const FEATURES = [
  {
    icon: Kanban,
    title: 'Kanban Board',
    desc: 'Manage your todos across multiple repos with a visual task board.',
  },
  {
    icon: TrendingUp,
    title: 'Analytics',
    desc: 'Track your output and progress with detailed charts over time.',
  },
  {
    icon: BookOpen,
    title: 'File Browser',
    desc: 'Navigate, read, and edit your markdown notes and documents.',
  },
  {
    icon: GitMerge,
    title: 'No Lock-in',
    desc: 'Plain markdown files in your own GitHub repositories. Export any time.',
  },
  {
    icon: LayoutGrid,
    title: 'Multi-workspace',
    desc: 'Switch between different repositories and contexts in seconds.',
  },
];

export interface LoginProps {
  onLogin: () => void;
}

export const Login = ({ onLogin }: LoginProps) => (
  <div className="life-os-root min-h-screen w-full cyber-grid-bg flex flex-col lg:flex-row">
    {/* ── Left: Hero (desktop only) ──────────────────────────────────────── */}
    <div className="hidden lg:flex flex-1 flex-col justify-between p-16 border-r border-[var(--los-border)]">
      {/* Wordmark */}
      <div>
        <span className="text-xs font-mono tracking-[0.3em] text-[var(--los-accent)] uppercase">
          kaihuman
        </span>
      </div>

      {/* Main copy */}
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-bold font-mono tracking-tight text-[var(--los-fg)] leading-tight">
            The ever-improving
            <br />
            <span className="text-[var(--los-accent)]">human.</span>
          </h1>
          <p className="text-sm font-mono text-[var(--los-muted)] max-w-md leading-relaxed">
            A personal operating system built on top of your GitHub repositories. Tasks, notes, and
            knowledge — all in plain markdown, all under your control.
          </p>
        </div>

        {/* Features */}
        <div className="flex flex-col gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 group">
              <div className="w-8 h-8 border border-[var(--los-border)] flex items-center justify-center shrink-0 group-hover:border-[var(--los-accent)] transition-colors">
                <Icon size={14} className="text-[var(--los-accent)]" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--los-fg)]">
                  {title}
                </span>
                <p className="text-xs font-mono text-[var(--los-muted)] mt-0.5 leading-relaxed">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] font-mono text-[var(--los-muted)] opacity-50">
        Your data lives in your repositories. Always.
      </p>
    </div>

    {/* ── Right: Login ───────────────────────────────────────────────────── */}
    <div className="flex flex-col items-center justify-center w-full lg:w-[480px] lg:shrink-0 min-h-screen px-8 py-16 gap-10">
      {/* Mobile wordmark */}
      <div className="flex flex-col items-center gap-2 lg:hidden">
        <span className="text-xs font-mono tracking-[0.3em] text-[var(--los-accent)] uppercase">
          kaihuman
        </span>
        <p className="text-[10px] font-mono text-[var(--los-muted)] text-center">
          The ever-improving human.
        </p>
      </div>

      {/* Desktop label */}
      <div className="hidden lg:flex flex-col items-center gap-2">
        <Logo size={40} />
        <span className="text-[10px] font-mono tracking-[0.25em] text-[var(--los-muted)] uppercase">
          Sign in to continue
        </span>
      </div>

      {/* GitHub button */}
      <button
        type="button"
        onClick={onLogin}
        className="w-full max-w-sm flex items-center justify-center gap-3 bg-[var(--los-accent)] text-black font-mono font-bold text-sm uppercase tracking-widest px-6 py-4 hover:opacity-90 active:opacity-75 transition-opacity"
      >
        <Github size={18} />
        Sign in with GitHub
      </button>

      {/* Permissions notice */}
      <div className="w-full max-w-sm border border-[var(--los-accent)]/40 bg-[var(--los-accent)]/5 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-[var(--los-accent)] shrink-0" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--los-accent)]">
            GitHub Read &amp; Write Access Required
          </span>
        </div>
        <p className="text-[11px] font-mono text-[var(--los-muted)] leading-relaxed">
          kaihuman reads and writes files{' '}
          <span className="text-[var(--los-fg)]">directly to your GitHub repositories</span>. This
          is not optional — it is how the app works. Your notes, tasks, and knowledge base are
          stored as plain markdown files in your repos.
        </p>
        <p className="text-[11px] font-mono text-[var(--los-muted)] leading-relaxed">
          No data is stored on our servers. Everything lives in your GitHub account.
        </p>
      </div>

      {/* Footer */}
      <p className="text-[9px] font-mono text-[var(--los-muted)] opacity-40 text-center max-w-xs">
        By signing in you agree to grant the necessary GitHub permissions for the app to function.
      </p>
    </div>
  </div>
);
