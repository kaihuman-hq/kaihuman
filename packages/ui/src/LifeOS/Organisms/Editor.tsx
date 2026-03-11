import { MonoText } from '../Atoms/Typography';

export const Editor = () => {
  return (
    <div className="h-full w-full flex flex-col bg-[var(--los-bg)]">
      {/* Micro Header */}
      <div className="h-6 flex items-center justify-between px-2 border-b border-[var(--los-border)]">
        <MonoText className="text-xs">NOTES.md</MonoText>
        <div className="h-2 w-2 rounded-full bg-[var(--los-accent)]" />
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 font-mono text-sm text-[var(--los-fg)] opacity-80 leading-relaxed">
        <p># KaiHuman v1.0</p>
        <p className="mt-4">The digital bento box is alive.</p>
        <div className="w-2 h-4 bg-[var(--los-accent)] animate-pulse inline-block ml-1 align-middle" />
      </div>
    </div>
  );
};
