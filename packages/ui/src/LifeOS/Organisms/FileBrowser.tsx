import { h } from 'preact';
import { cn } from '../../utils';
import { MonoText } from '../Atoms/Typography';

const Column = ({ title, active }: { title: string; active?: boolean }) => (
  <div className="flex-1 border-r border-[var(--los-border)] flex flex-col min-w-[200px]">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className={cn(
          "px-3 py-1 flex items-center justify-between cursor-pointer hover:bg-white/5 group",
          active && i === 2 && "bg-[var(--los-accent)] text-black font-bold hover:bg-[var(--los-accent)]"
        )}
      >
        <MonoText className={cn("text-xs group-hover:text-white", active && i === 2 && "text-black")}>
          {active && i === 2 ? "selected_folder" : `folder_0${i}`}
        </MonoText>
        <span className="text-[10px] opacity-50">{'>'}</span>
      </div>
    ))}
  </div>
);

export const FileBrowser = () => {
  return (
    <div className="h-full w-full flex overflow-x-auto bg-[var(--los-bg)]">
      <Column title="Root" />
      <Column title="Projects" active />
      <div className="flex-1 bg-[var(--los-bg)] p-4 flex items-center justify-center text-[var(--los-muted)]">
        <MonoText>Preview Pane</MonoText>
      </div>
    </div>
  )
}
