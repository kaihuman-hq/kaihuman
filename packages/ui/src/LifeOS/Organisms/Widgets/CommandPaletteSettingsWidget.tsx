import {
  buildLinkUrl,
  type CommandPaletteSettings,
  DEFAULT_PALETTE_SETTINGS,
  type LinkParam,
  type PaletteToolSetting,
  paletteSettingsProblems,
  readPaletteSettings,
  type SearchEngineSetting,
  serializePaletteSettings,
} from '@kaihuman/formats';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactWidgetLayout } from './CompactWidgetLayout';

export interface CommandPaletteSettingsWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  onChange?: (newContent: string) => void;
}

/** What the preview builds each link for. */
const SAMPLE_QUERY = 'example';

const INPUT_CLASS =
  'min-w-0 bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50';

const ICON_BUTTON_CLASS =
  'shrink-0 p-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)] disabled:opacity-30 disabled:pointer-events-none transition-colors';

const TEXT_BUTTON_CLASS =
  'flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)] disabled:opacity-40 disabled:pointer-events-none transition-colors';

/** `list` with the entry at `index` moved one place up (-1) or down (1). */
const moved = <T,>(list: readonly T[], index: number, offset: -1 | 1): T[] => {
  const target = index + offset;
  const next = [...list];
  const [entry] = next.splice(index, 1);
  if (entry === undefined || target < 0 || target > list.length - 1) return [...list];
  next.splice(target, 0, entry);
  return next;
};

const replaced = <T,>(list: readonly T[], index: number, entry: T): T[] =>
  list.map((candidate, at) => (at === index ? entry : candidate));

const without = <T,>(list: readonly T[], index: number): T[] =>
  list.filter((_, at) => at !== index);

/** Up, down and delete for one entry of a list. */
const RowControls = ({
  index,
  count,
  label,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}) => (
  <div className="flex gap-1 shrink-0">
    <button
      type="button"
      title={`Move ${label} up`}
      aria-label={`Move ${label} up`}
      disabled={index === 0}
      onClick={() => onMove(-1)}
      className={ICON_BUTTON_CLASS}
    >
      <ArrowUp size={12} />
    </button>
    <button
      type="button"
      title={`Move ${label} down`}
      aria-label={`Move ${label} down`}
      disabled={index === count - 1}
      onClick={() => onMove(1)}
      className={ICON_BUTTON_CLASS}
    >
      <ArrowDown size={12} />
    </button>
    <button
      type="button"
      title={`Remove ${label}`}
      aria-label={`Remove ${label}`}
      onClick={onDelete}
      className={cn(ICON_BUTTON_CLASS, 'hover:border-red-400 hover:text-red-400')}
    >
      <Trash2 size={12} />
    </button>
  </div>
);

/** The query parameters a link adds: name, value and, optionally, the value with nothing typed. */
const ParamsEditor = ({
  params,
  onChange,
}: {
  params: LinkParam[];
  onChange: (params: LinkParam[]) => void;
}) => (
  <div className="flex flex-col gap-1">
    {params.map((param, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: parameters have no identity but their place
      <div key={index} className="flex gap-1 items-center">
        <input
          value={param.key}
          placeholder="name"
          aria-label="Parameter name"
          onInput={(e) =>
            onChange(replaced(params, index, { ...param, key: e.currentTarget.value }))
          }
          className={cn(INPUT_CLASS, 'w-28')}
        />
        <input
          value={param.value}
          placeholder="value — {query} is what is typed"
          aria-label="Parameter value"
          onInput={(e) =>
            onChange(replaced(params, index, { ...param, value: e.currentTarget.value }))
          }
          className={cn(INPUT_CLASS, 'flex-1')}
        />
        <input
          value={param.empty ?? ''}
          placeholder="with nothing typed (optional)"
          aria-label="Parameter value with nothing typed"
          onInput={(e) => {
            const { empty: _, ...rest } = param;
            const empty = e.currentTarget.value;
            onChange(replaced(params, index, empty ? { ...rest, empty } : rest));
          }}
          className={cn(INPUT_CLASS, 'flex-1')}
        />
        <RowControls
          index={index}
          count={params.length}
          label={`parameter ${param.key || index + 1}`}
          onMove={(offset) => onChange(moved(params, index, offset))}
          onDelete={() => onChange(without(params, index))}
        />
      </div>
    ))}
    <div>
      <button
        type="button"
        onClick={() => onChange([...params, { key: '', value: '' }])}
        className={TEXT_BUTTON_CLASS}
      >
        <Plus size={11} /> Parameter
      </button>
    </div>
  </div>
);

/** The link built for the sample query, so a template can be checked before it is saved. */
const Preview = ({ link }: { link: Pick<SearchEngineSetting, 'url' | 'params'> }) => (
  <MonoText className="text-[9px] text-[var(--los-muted)] break-all block">
    “{SAMPLE_QUERY}” → {buildLinkUrl(link, SAMPLE_QUERY)}
  </MonoText>
);

const SectionHeader = ({ title, note }: { title: string; note: string }) => (
  <div className="flex flex-col gap-0.5">
    <MonoHeader className="text-sm">{title}</MonoHeader>
    <MonoText className="text-[10px] text-[var(--los-muted)]">{note}</MonoText>
  </div>
);

/** Buttons that add back each default the list no longer has (matched by URL). */
const MissingDefaults = <T extends { name: string; url: string }>({
  links,
  defaults,
  onAdd,
}: {
  links: readonly T[];
  defaults: readonly T[];
  onAdd: (link: T) => void;
}) => (
  <>
    {defaults
      .filter((link) => !links.some((candidate) => candidate.url === link.url))
      .map((link) => (
        <button
          key={link.url}
          type="button"
          title={link.url}
          onClick={() => onAdd(structuredClone(link))}
          className={TEXT_BUTTON_CLASS}
        >
          <Plus size={11} /> {link.name}
        </button>
      ))}
  </>
);

/** A list of named links — the search engines or the assistants — to add to, edit and reorder. */
const LinkListSection = ({
  title,
  note,
  noun,
  placeholder,
  links,
  defaults,
  onChange,
}: {
  title: string;
  note: string;
  /** Names the list's entries in labels — "Search engine name". */
  noun: string;
  placeholder: string;
  links: SearchEngineSetting[];
  defaults: readonly SearchEngineSetting[];
  onChange: (links: SearchEngineSetting[]) => void;
}) => (
  <section className="flex flex-col gap-3">
    <SectionHeader title={title} note={note} />
    {links.map((link, index) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: the name is being edited, so only the place identifies an entry
        key={index}
        className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-3"
      >
        <div className="flex gap-1 items-center">
          <input
            value={link.name}
            placeholder="Name"
            aria-label={`${noun} name`}
            onInput={(e) =>
              onChange(replaced(links, index, { ...link, name: e.currentTarget.value }))
            }
            className={cn(INPUT_CLASS, 'w-32')}
          />
          <input
            value={link.url}
            placeholder={placeholder}
            aria-label={`${noun} URL`}
            onInput={(e) =>
              onChange(replaced(links, index, { ...link, url: e.currentTarget.value }))
            }
            className={cn(INPUT_CLASS, 'flex-1')}
          />
          <RowControls
            index={index}
            count={links.length}
            label={link.name || `this ${noun.toLowerCase()}`}
            onMove={(offset) => onChange(moved(links, index, offset))}
            onDelete={() => onChange(without(links, index))}
          />
        </div>
        {link.params.length > 0 && (
          <ParamsEditor
            params={link.params}
            onChange={(params) => onChange(replaced(links, index, { ...link, params }))}
          />
        )}
        <Preview link={link} />
      </div>
    ))}
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onChange([...links, { name: '', url: '', params: [] }])}
        className={TEXT_BUTTON_CLASS}
      >
        <Plus size={11} /> {noun}
      </button>
      <MissingDefaults
        links={links}
        defaults={defaults}
        onAdd={(link) => onChange([...links, link])}
      />
    </div>
  </section>
);

/**
 * The command palettes' settings: the web search engines, in the order the palette offers them,
 * the AI assistants `>a` asks, and the link tools behind a prefix (`>l` Tsuga logs). Edits stay a draft until saved, since the
 * console writes every change straight to GitHub.
 */
export const CommandPaletteSettingsWidget = ({
  content,
  mode,
  onChange,
}: CommandPaletteSettingsWidgetProps) => {
  const read = useMemo(() => readPaletteSettings(content), [content]);
  const [draft, setDraft] = useState<CommandPaletteSettings>(read.settings);
  const [dirty, setDirty] = useState(false);

  // A save, or a change made elsewhere, replaces the draft — unless it holds unsaved edits.
  useEffect(() => {
    if (!dirty) setDraft(read.settings);
  }, [read, dirty]);

  const edit = (next: CommandPaletteSettings) => {
    setDraft(next);
    setDirty(true);
  };
  const setTools = (tools: PaletteToolSetting[]) => edit({ ...draft, tools });

  const problems = useMemo(() => paletteSettingsProblems(draft), [draft]);

  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
        <MonoHeader className="text-5xl font-bold text-[var(--los-fg)] mb-1">
          {read.settings.searchEngines.length +
            read.settings.assistants.length +
            read.settings.tools.length}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
          PALETTE LINKS
        </MonoText>
      </div>
    );
  }

  if (mode === 'SMALL' || mode === 'MOBILE_EXPANDED') {
    const body = (
      <div className="flex flex-col gap-3">
        {read.error && <MonoText className="text-[10px] text-red-400">{read.error}</MonoText>}
        <div className="flex flex-col gap-1">
          <MonoText className="text-[9px] text-[var(--los-muted)] uppercase">
            Search engines
          </MonoText>
          <MonoText className="text-xs">
            {read.settings.searchEngines.map((engine) => engine.name).join(' · ') || 'None'}
          </MonoText>
        </div>
        <div className="flex flex-col gap-1">
          <MonoText className="text-[9px] text-[var(--los-muted)] uppercase">
            AI assistants (&gt;a)
          </MonoText>
          <MonoText className="text-xs">
            {read.settings.assistants.map((assistant) => assistant.name).join(' · ') || 'None'}
          </MonoText>
        </div>
        <div className="flex flex-col gap-1">
          <MonoText className="text-[9px] text-[var(--los-muted)] uppercase">Tools</MonoText>
          {read.settings.tools.length === 0 && <MonoText className="text-xs">None</MonoText>}
          {read.settings.tools.map((tool) => (
            <MonoText key={tool.prefix} className="text-xs truncate block">
              <span className="text-[var(--los-accent)]">&gt;{tool.prefix}</span> {tool.name}
            </MonoText>
          ))}
        </div>
      </div>
    );
    if (mode === 'MOBILE_EXPANDED') {
      return (
        <CompactWidgetLayout>
          <MonoHeader className="text-xs text-[var(--los-muted)] shrink-0">
            COMMAND PALETTE
          </MonoHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>
        </CompactWidgetLayout>
      );
    }
    return (
      <div className="w-full flex flex-col p-4 relative h-full">
        <MonoHeader className="text-sm mb-2 shrink-0">COMMAND PALETTE</MonoHeader>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">{body}</div>
      </div>
    );
  }

  // ── FOCUS mode ──────────────────────────────────────────────────────────────

  // Editing a file that could not be read would replace it with the defaults.
  if (read.error) {
    return (
      <div className="w-full p-6">
        <MonoText className="text-xs text-red-400">
          {read.error} — fix it in the code view first; the palettes use the defaults until then.
        </MonoText>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 p-6 min-h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-wrap">
        <MonoText className="text-[10px] text-[var(--los-muted)] flex-1">
          {dirty ? 'Unsaved changes' : 'Read by the browser extension and the desktop palette'}
        </MonoText>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDraft(read.settings);
            setDirty(false);
          }}
          className={TEXT_BUTTON_CLASS}
        >
          Revert
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            onChange?.(serializePaletteSettings(draft));
            setDirty(false);
          }}
          className={cn(
            TEXT_BUTTON_CLASS,
            'border-[var(--los-accent)] text-[var(--los-accent)] hover:border-[var(--los-accent)] hover:text-[var(--los-fg)]',
          )}
        >
          Save
        </button>
      </div>

      {problems.length > 0 && (
        <div className="flex flex-col gap-1 border border-red-400/50 p-3">
          <MonoText className="text-[10px] text-red-400 uppercase">
            Left out of the palette until fixed
          </MonoText>
          {problems.map((problem) => (
            <MonoText key={problem} className="text-xs text-red-400 block">
              {problem}
            </MonoText>
          ))}
        </div>
      )}

      <LinkListSection
        title="SEARCH ENGINES"
        note="Offered for anything typed, in this order — ⏎ with nothing else matching searches the first. {query} in the URL is what is typed."
        noun="Search engine"
        placeholder="https://example.com/search?q={query}"
        links={draft.searchEngines}
        defaults={DEFAULT_PALETTE_SETTINGS.searchEngines}
        onChange={(searchEngines) => edit({ ...draft, searchEngines })}
      />

      <LinkListSection
        title="AI ASSISTANTS"
        note="What >a offers a question to, in this order. {query} in the URL is the question; the palette also copies it, for assistants that open an empty chat."
        noun="Assistant"
        placeholder="https://example.com/chat?q={query}"
        links={draft.assistants}
        defaults={DEFAULT_PALETTE_SETTINGS.assistants}
        onChange={(assistants) => edit({ ...draft, assistants })}
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="TOOLS"
          note="A link behind a prefix: >l then a term opens the link built from it. Parameters are added to the URL in order; {query} in a value is the term."
        />
        {draft.tools.map((tool, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the prefix is being edited, so only the place identifies an entry
            key={index}
            className="flex flex-col gap-1 border-b border-[var(--los-border)] pb-3"
          >
            <div className="flex gap-1 items-center">
              <span className="text-xs font-mono text-[var(--los-accent)]">&gt;</span>
              <input
                value={tool.prefix}
                placeholder="l"
                aria-label="Tool prefix"
                onInput={(e) =>
                  setTools(
                    replaced(draft.tools, index, {
                      ...tool,
                      prefix: e.currentTarget.value.trim().toLowerCase(),
                    }),
                  )
                }
                className={cn(INPUT_CLASS, 'w-12')}
              />
              <input
                value={tool.name}
                placeholder="Name"
                aria-label="Tool name"
                onInput={(e) =>
                  setTools(replaced(draft.tools, index, { ...tool, name: e.currentTarget.value }))
                }
                className={cn(INPUT_CLASS, 'w-40')}
              />
              <input
                value={tool.description ?? ''}
                placeholder="Description (optional)"
                aria-label="Tool description"
                onInput={(e) => {
                  const { description: _, ...rest } = tool;
                  const description = e.currentTarget.value;
                  setTools(
                    replaced(draft.tools, index, description ? { ...rest, description } : rest),
                  );
                }}
                className={cn(INPUT_CLASS, 'flex-1')}
              />
              <RowControls
                index={index}
                count={draft.tools.length}
                label={tool.name || 'this tool'}
                onMove={(offset) => setTools(moved(draft.tools, index, offset))}
                onDelete={() => setTools(without(draft.tools, index))}
              />
            </div>
            <input
              value={tool.url}
              placeholder="https://example.com/explorer"
              aria-label="Tool URL"
              onInput={(e) =>
                setTools(replaced(draft.tools, index, { ...tool, url: e.currentTarget.value }))
              }
              className={INPUT_CLASS}
            />
            <ParamsEditor
              params={tool.params}
              onChange={(params) => setTools(replaced(draft.tools, index, { ...tool, params }))}
            />
            <Preview link={tool} />
          </div>
        ))}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              setTools([...draft.tools, { prefix: '', name: '', url: '', params: [] }])
            }
            className={TEXT_BUTTON_CLASS}
          >
            <Plus size={11} /> Tool
          </button>
          <MissingDefaults
            links={draft.tools}
            defaults={DEFAULT_PALETTE_SETTINGS.tools}
            onAdd={(tool) => setTools([...draft.tools, tool])}
          />
        </div>
      </section>
    </div>
  );
};
