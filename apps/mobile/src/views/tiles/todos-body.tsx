import type { TodoDue, TodoRepeat, TodoStatus } from '@kaihuman/formats';
import { type ReactNode, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
} from 'react-native';
import {
  addMilestoneTo,
  addTodoTask,
  deleteMilestone,
  editMilestone,
  filterByTag,
  migrateTodos,
  normalizeTag,
  promptText,
  setTodoDueAt,
  setTodoMilestoneAt,
  setTodoPromptAt,
  setTodoStatusAt,
  type TodoRow,
  type TodosView,
  todosView,
  toggleTodo,
} from '../../components/widgets/todos-tile.js';
import { dueBadge, retargetRepeat } from '../../screens/todo-due.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, Chip, haptics, Icon, Text, TextField } from '../../ui/index.js';
import { DueEditor } from '../due-editor.js';
import { DueSheet } from '../due-sheet.js';
import type { Ctx } from './bodies.js';
import { CheckCircle, EmptyLine, ItemRow, QuickAdd, type RowAction, Rows } from './parts.js';

/** A bottom sheet that scrolls and lifts above the keyboard; tapping outside closes it. */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors, spacing, shape } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}
        >
          {/* Swallows presses so taps inside the sheet do not dismiss it. */}
          <Pressable
            accessible={false}
            style={{
              backgroundColor: colors.surface,
              maxHeight: '85%',
              borderTopLeftRadius: shape.lg,
              borderTopRightRadius: shape.lg,
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            >
              <Text variant="headline" numberOfLines={2} accessibilityRole="header">
                {title}
              </Text>
              {children}
              <Button label="Close" variant="plain" fullWidth onPress={onClose} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const Wrap = ({ children }: { children: ReactNode }) => {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
  );
};

// ─── Add-task details ────────────────────────────────────────────────────────

interface Draft {
  tags: string[];
  newTag: string;
  milestoneId?: string;
  due?: TodoDue;
  repeat?: TodoRepeat;
}

const EMPTY_DRAFT: Draft = { tags: [], newTag: '' };

/** Tags, milestone, due date and repeat for the task being typed, as on the web add form. */
function AddDetails({
  view,
  draft,
  setDraft,
  now,
}: {
  view: TodosView;
  draft: Draft;
  setDraft: (next: Draft) => void;
  now: Date;
}) {
  const { spacing } = useTheme();
  const tags = [...new Set([...view.tags, ...draft.tags])].sort();
  const toggle = (tag: string) =>
    setDraft({
      ...draft,
      tags: draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag],
    });
  const addTag = () => {
    const tag = normalizeTag(draft.newTag);
    if (!tag) return;
    setDraft({
      ...draft,
      newTag: '',
      tags: draft.tags.includes(tag) ? draft.tags : [...draft.tags, tag],
    });
  };
  return (
    <View style={{ gap: spacing.md }} testID="todo-details">
      <View style={{ gap: spacing.sm }}>
        <Text variant="subheadline" tone="secondary">
          Tags
        </Text>
        {tags.length > 0 ? (
          <Wrap>
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={`#${tag}`}
                selected={draft.tags.includes(tag)}
                accessibilityLabel={`Tag ${tag}`}
                onPress={() => toggle(tag)}
              />
            ))}
          </Wrap>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="New tag"
              placeholder="new-tag"
              value={draft.newTag}
              onChangeText={(newTag) => setDraft({ ...draft, newTag })}
              returnKeyType="done"
              onSubmitEditing={addTag}
            />
          </View>
          <Button
            label="Add tag"
            variant="tinted"
            size="medium"
            disabled={!normalizeTag(draft.newTag)}
            onPress={addTag}
          />
        </View>
      </View>
      {view.milestones.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="subheadline" tone="secondary">
            Milestone
          </Text>
          <Wrap>
            <Chip
              label="None"
              selected={!draft.milestoneId}
              accessibilityLabel="No milestone"
              onPress={() => setDraft({ ...draft, milestoneId: undefined })}
            />
            {view.milestones.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                selected={draft.milestoneId === m.id}
                accessibilityLabel={`Milestone ${m.name}`}
                onPress={() => setDraft({ ...draft, milestoneId: m.id })}
              />
            ))}
          </Wrap>
        </View>
      ) : null}
      <DueEditor
        value={draft.due}
        onChange={(next) =>
          setDraft({
            ...draft,
            due: next,
            repeat:
              next && draft.repeat && draft.due
                ? retargetRepeat(draft.repeat, draft.due.date, next.date)
                : undefined,
          })
        }
        {...(draft.repeat && { repeat: draft.repeat })}
        onRepeatChange={(repeat) => setDraft({ ...draft, repeat })}
        now={now}
      />
    </View>
  );
}

// ─── Milestone manager ───────────────────────────────────────────────────────

function MilestoneSheet({
  view,
  ctx,
  onClose,
}: {
  view: TodosView;
  ctx: Ctx;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const today = ctx.now.toISOString().slice(0, 10);

  const add = () => {
    if (ctx.apply(addMilestoneTo(ctx.content, name, date, ctx.now))) {
      haptics.success();
      setName('');
      setDate(undefined);
    } else haptics.error();
  };
  return (
    <Sheet title="Milestones" onClose={onClose}>
      {view.milestones.length === 0 ? <EmptyLine>No milestones yet.</EmptyLine> : null}
      {view.milestones.map((m) => (
        <View key={m.id} style={{ gap: spacing.sm }} testID={`milestone-${m.id}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{m.name}</Text>
              <Text
                variant="footnote"
                tone={m.dueDate && m.dueDate < today ? 'danger' : 'secondary'}
              >
                {m.dueDate ?? 'No date'}
              </Text>
            </View>
            <Button
              label={editing === m.id ? 'Done' : 'Edit'}
              variant="tinted"
              size="small"
              accessibilityLabel={`${editing === m.id ? 'Finish editing' : 'Edit'} ${m.name}`}
              onPress={() => {
                setEditing(editing === m.id ? null : m.id);
                setRename(m.name);
              }}
            />
            <Button
              label="Delete"
              variant="plain"
              size="small"
              accessibilityLabel={`Delete ${m.name}`}
              onPress={() => {
                if (ctx.apply(deleteMilestone(ctx.content, m.id))) haptics.success();
              }}
            />
          </View>
          {editing === m.id ? (
            <View style={{ gap: spacing.sm }}>
              <TextField
                label="Milestone name"
                value={rename}
                onChangeText={setRename}
                autoCapitalize="sentences"
                returnKeyType="done"
                onSubmitEditing={() =>
                  ctx.apply(editMilestone(ctx.content, m.id, { name: rename }))
                }
              />
              <Button
                label="Rename"
                variant="tinted"
                size="medium"
                disabled={!rename.trim() || rename.trim() === m.name}
                onPress={() => ctx.apply(editMilestone(ctx.content, m.id, { name: rename }))}
              />
              <DueEditor
                dateOnly
                value={m.dueDate ? { date: m.dueDate } : undefined}
                onChange={(due) =>
                  ctx.apply(editMilestone(ctx.content, m.id, { dueDate: due?.date ?? null }))
                }
                now={ctx.now}
              />
            </View>
          ) : null}
        </View>
      ))}
      <View style={{ gap: spacing.sm }}>
        <TextField
          label="New milestone"
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <DueEditor
          dateOnly
          value={date ? { date } : undefined}
          onChange={(due) => setDate(due?.date)}
          now={ctx.now}
        />
        <Button label="Add milestone" disabled={!name.trim()} fullWidth onPress={add} />
      </View>
    </Sheet>
  );
}

// ─── Per-task sheets ─────────────────────────────────────────────────────────

function MilestonePickSheet({
  row,
  view,
  ctx,
  onClose,
}: {
  row: TodoRow;
  view: TodosView;
  ctx: Ctx;
  onClose: () => void;
}) {
  const pick = (id: string | undefined) => {
    if (ctx.apply(setTodoMilestoneAt(ctx.content, row.index, id))) onClose();
  };
  return (
    <Sheet title={`Milestone: ${row.text}`} onClose={onClose}>
      <Button
        label="No milestone"
        variant={row.milestoneId ? 'tinted' : 'filled'}
        fullWidth
        onPress={() => pick(undefined)}
      />
      {view.milestones.map((m) => (
        <Button
          key={m.id}
          label={m.dueDate ? `${m.name} (${m.dueDate})` : m.name}
          variant={row.milestoneId === m.id ? 'filled' : 'tinted'}
          fullWidth
          onPress={() => pick(m.id)}
        />
      ))}
      {view.milestones.length === 0 ? (
        <EmptyLine>Add a milestone first, from the Milestones button.</EmptyLine>
      ) : null}
    </Sheet>
  );
}

/** The task's AI prompt: edit its lines and reference file, and share it to another app. */
function PromptSheet({ row, ctx, onClose }: { row: TodoRow; ctx: Ctx; onClose: () => void }) {
  const [text, setText] = useState((row.prompt?.lines ?? []).join('\n'));
  const [ref, setRef] = useState(row.prompt?.refFile ?? '');
  const draft = promptText({
    lines: text.split('\n').filter((l) => l.trim()),
    ...(ref.trim() && { refFile: ref.trim() }),
  });
  return (
    <Sheet title={`AI prompt: ${row.text}`} onClose={onClose}>
      <TextField
        label="Prompt"
        placeholder="Write the AI prompt here..."
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="sentences"
      />
      <TextField
        label="Reference file"
        placeholder="path/to/prompts.md (optional)"
        value={ref}
        onChangeText={setRef}
      />
      <Button
        label="Save prompt"
        fullWidth
        onPress={() => {
          if (ctx.apply(setTodoPromptAt(ctx.content, row.index, text, ref))) {
            haptics.success();
            onClose();
          }
        }}
      />
      <Button
        label="Copy or share"
        icon="share"
        variant="tinted"
        fullWidth
        disabled={!draft}
        onPress={() => void Share.share({ message: draft })}
      />
    </Sheet>
  );
}

type Open = { kind: 'milestones' } | { kind: 'milestone' | 'prompt' | 'due'; index: number } | null;

const NEXT_ACTIONS: Record<TodoStatus, readonly { status: TodoStatus; label: string }[]> = {
  backlog: [
    { status: 'in-progress', label: 'Start' },
    { status: 'done', label: 'Mark done' },
    { status: 'rejected', label: 'Reject' },
  ],
  'in-progress': [
    { status: 'backlog', label: 'Back to backlog' },
    { status: 'done', label: 'Mark done' },
    { status: 'rejected', label: 'Reject' },
  ],
  done: [{ status: 'backlog', label: 'Reopen' }],
  rejected: [{ status: 'backlog', label: 'Reopen' }],
};

export function Todos({ view: initial, ctx }: { view: TodosView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState('');
  const [details, setDetails] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tag, setTag] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Open>(null);

  const view = showAll ? todosView(ctx.content, ctx.now, Number.POSITIVE_INFINITY) : initial;
  const activeTag = tag && view.tags.includes(tag) ? tag : null;
  const rows = filterByTag(view.rows, activeTag);
  const target =
    open && open.kind !== 'milestones' ? view.rows.find((r) => r.index === open.index) : undefined;

  const add = () => {
    const pending = normalizeTag(draft.newTag);
    const tags = pending ? [...draft.tags, pending] : draft.tags;
    const result = addTodoTask(ctx.content, text, ctx.now, tags, {
      ...(draft.milestoneId && { milestoneId: draft.milestoneId }),
      ...(draft.due && { due: draft.due }),
      ...(draft.repeat && { repeat: draft.repeat }),
    });
    if (ctx.apply(result)) {
      haptics.success();
      setText('');
      setDraft(EMPTY_DRAFT);
      setDetails(false);
    } else haptics.error();
  };

  const actionsFor = (r: TodoRow): RowAction[] => [
    ...NEXT_ACTIONS[r.status].map((a) => ({
      label: a.label,
      onPress: () => {
        if (ctx.apply(setTodoStatusAt(ctx.content, r.index, a.status, ctx.now))) haptics.light();
      },
    })),
    { label: 'Milestone…', onPress: () => setOpen({ kind: 'milestone', index: r.index }) },
    { label: 'Due date…', onPress: () => setOpen({ kind: 'due', index: r.index }) },
    {
      label: r.prompt ? 'AI prompt…' : 'Add AI prompt…',
      onPress: () => setOpen({ kind: 'prompt', index: r.index }),
    },
  ];

  return (
    <>
      {view.legacy ? (
        <Button
          label="Migrate to the new format"
          icon="warning"
          variant="tinted"
          size="small"
          onPress={() => {
            if (ctx.apply(migrateTodos(ctx.content))) haptics.success();
          }}
        />
      ) : null}
      {view.tags.length > 0 ? (
        <Wrap>
          <Chip
            label="All"
            selected={!activeTag}
            accessibilityLabel="All tags"
            onPress={() => setTag(null)}
          />
          {view.tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              selected={activeTag === t}
              accessibilityLabel={`Filter ${t}`}
              onPress={() => setTag(activeTag === t ? null : t)}
            />
          ))}
        </Wrap>
      ) : null}
      {rows.length === 0 ? (
        <EmptyLine>
          {activeTag ? `Nothing tagged #${activeTag}.` : 'All clear. Nothing to do.'}
        </EmptyLine>
      ) : (
        <Rows>
          {rows.map((r) => {
            const done = r.status === 'done' || r.status === 'rejected';
            const due = dueBadge(r, ctx.now);
            const subtitle = [
              r.status === 'in-progress'
                ? 'In progress'
                : r.status === 'rejected'
                  ? 'Rejected'
                  : '',
              r.milestone ? `!${r.milestone}` : '',
              ...r.tags.map((t) => `#${t}`),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ItemRow
                key={r.id}
                trailing={
                  due || r.prompt ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {r.prompt ? (
                        <Icon
                          name="prompt"
                          size={14}
                          color={colors.secondaryLabel}
                          accessibilityLabel="Has AI prompt"
                        />
                      ) : null}
                      {due?.repeat ? (
                        <Icon
                          name="repeat"
                          size={14}
                          color={colors.secondaryLabel}
                          accessibilityLabel={`Repeats ${due.repeat}`}
                        />
                      ) : null}
                      {due ? <Badge tone={due.tone} label={due.label} /> : null}
                    </View>
                  ) : undefined
                }
                testID={`todo-${r.index}`}
                role="checkbox"
                checked={done}
                title={r.text}
                done={done}
                subtitle={subtitle || undefined}
                leading={<CheckCircle on={done} />}
                actions={actionsFor(r)}
                onPress={() => {
                  if (ctx.apply(toggleTodo(ctx.content, r.index, ctx.now))) {
                    if (done) haptics.light();
                    else haptics.success();
                  }
                }}
              />
            );
          })}
        </Rows>
      )}
      <Wrap>
        <Button
          label={`Milestones${view.milestones.length > 0 ? ` (${view.milestones.length})` : ''}`}
          icon="flag"
          variant="tinted"
          size="small"
          testID="todo-milestones"
          onPress={() => setOpen({ kind: 'milestones' })}
        />
        {showAll || initial.hiddenCount > 0 ? (
          <Button
            label={showAll ? 'Hide older completed' : `Show ${initial.hiddenCount} older completed`}
            variant="plain"
            size="small"
            testID="todo-show-all"
            onPress={() => setShowAll(!showAll)}
          />
        ) : null}
      </Wrap>
      <QuickAdd
        label="New task"
        placeholder="What needs doing?"
        value={text}
        onChangeText={setText}
        onSubmit={add}
        addLabel="Add task"
      />
      <Button
        label={details ? 'Hide details' : 'Details: tags, milestone, due, repeat'}
        icon={details ? 'chevronDown' : 'chevronRight'}
        variant="plain"
        size="small"
        testID="todo-details-toggle"
        onPress={() => setDetails(!details)}
      />
      {details ? <AddDetails view={view} draft={draft} setDraft={setDraft} now={ctx.now} /> : null}

      {open?.kind === 'milestones' ? (
        <MilestoneSheet view={view} ctx={ctx} onClose={() => setOpen(null)} />
      ) : null}
      {target && open?.kind === 'milestone' ? (
        <MilestonePickSheet row={target} view={view} ctx={ctx} onClose={() => setOpen(null)} />
      ) : null}
      {target && open?.kind === 'prompt' ? (
        <PromptSheet row={target} ctx={ctx} onClose={() => setOpen(null)} />
      ) : null}
      {target && open?.kind === 'due' ? (
        <DueSheet
          title={target.text}
          current={
            target.dueDate
              ? { date: target.dueDate, ...(target.dueTime && { time: target.dueTime }) }
              : undefined
          }
          {...(target.repeat && { currentRepeat: target.repeat })}
          now={ctx.now}
          onSelect={(due, repeat) => {
            if (ctx.apply(setTodoDueAt(ctx.content, target.index, due, repeat))) setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
