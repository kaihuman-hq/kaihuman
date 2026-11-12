import type { TodoDue, TodoRepeat } from '@kaihuman/formats';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  CAPTURE_SPECS,
  type CaptureTargetKind,
  normalizeFolder,
  rememberFolder,
  resolveTarget,
} from '../files/create-target.js';
import { smartInbox } from '../intelligence/smart-inbox.js';
import type { QuickKind } from '../navigation/routes.js';
import type { QuickCaptureController } from '../screens/quick-capture.js';
import { retargetRepeat } from '../screens/todo-due.js';
import { useTheme } from '../theme/theme.js';
import { Button, haptics, Icon, Screen, Text, TextField } from '../ui/index.js';
import { CreateTargetRow, useCreateTarget } from './create-target-row.js';
import { DueEditor } from './due-editor.js';

export const CAPTURE_TITLES: Record<QuickKind, string> = {
  todo: 'New todo',
  note: 'New note',
  log: 'New log entry',
  idea: 'New idea',
  knowledge: 'New knowledge',
  inbox: 'Add to inbox',
};

interface KindCopy {
  label: string;
  placeholder: string;
  multiline: boolean;
  extra?: { label: string; placeholder: string; helper: string };
}

const COPY: Record<QuickKind, KindCopy> = {
  todo: {
    label: 'Todo',
    placeholder: 'What needs doing?',
    multiline: false,
    extra: { label: 'Tags', placeholder: 'work, home', helper: 'Separate tags with commas.' },
  },
  note: { label: 'Note', placeholder: 'Write something down', multiline: true },
  log: {
    label: 'Log entry',
    placeholder: 'What did you do?',
    multiline: false,
    extra: { label: 'Tags', placeholder: 'focus, review', helper: 'Separate tags with commas.' },
  },
  idea: {
    label: 'Idea',
    placeholder: 'First line is the title, the rest is the braindump',
    multiline: true,
    extra: {
      label: 'Slug',
      placeholder: 'optional-file-name',
      helper: 'Leave empty to derive it from the title.',
    },
  },
  knowledge: {
    label: 'Source',
    placeholder: 'Paste a fact, quote or link',
    multiline: true,
    extra: {
      label: 'Title',
      placeholder: 'Optional',
      helper: 'Defaults to the first line.',
    },
  },
  // One line and Return saves: nothing to fill in before the keyboard can go away.
  inbox: { label: 'Inbox', placeholder: 'What is on your mind?', multiline: false },
};

type Status = { ok: boolean; text: string } | null;

/** What the header needs to render the primary action when the view does not draw its own button. */
export interface CaptureHeaderState {
  canSubmit: boolean;
  busy: boolean;
  submit: () => void;
}

const DISMISS_DELAY_MS = 800;

export function QuickCaptureView({
  controller,
  kind,
  initialText,
  onDone,
  headerAction,
  onHeaderState,
}: {
  controller: QuickCaptureController;
  kind: QuickKind;
  initialText?: string;
  /** Called shortly after a successful save so the sheet can dismiss. */
  onDone?: () => void;
  /** True when the header owns the primary action; the view then draws no button. */
  headerAction?: boolean;
  onHeaderState?: (state: CaptureHeaderState) => void;
}) {
  const { spacing, colors } = useTheme();
  const [text, setText] = useState(initialText ?? '');
  const [extra, setExtra] = useState('');
  const [due, setDue] = useState<TodoDue | undefined>();
  const [repeat, setRepeat] = useState<TodoRepeat | undefined>();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copy = COPY[kind];
  const spec = kind in CAPTURE_SPECS ? CAPTURE_SPECS[kind as CaptureTargetKind] : null;
  const appFolder = controller.files.appFolder();
  const paths = controller.files.paths?.() ?? [];
  const hint = kind === 'knowledge' ? extra.trim() || text.split('\n')[0] : undefined;
  const place = useCreateTarget(spec ?? CAPTURE_SPECS.note, appFolder, hint);

  useEffect(() => () => clearTimeout(timer.current), []);

  const submit = async () => {
    if (busy) return;
    haptics.light();
    setBusy(true);
    let result: Status;
    try {
      const value = extra.trim() || undefined;
      // Untouched, each kind keeps its built-in file, so the one-tap path behaves as before.
      const resolved = spec && place.custom ? resolveTarget(spec, place.target, paths) : null;
      if (resolved && !resolved.ok) throw new Error(resolved.error);
      const target = resolved?.ok ? resolved.path : undefined;
      if (kind === 'idea') {
        const res = await controller.quickIdea(text, value ? { slug: value } : {});
        result = res.ok
          ? { ok: true, text: `Saved ${res.results.map((r) => r.path).join(', ')}` }
          : { ok: false, text: res.error };
      } else {
        const res =
          kind === 'todo'
            ? await controller.quickTodo(text, value, due, due && repeat, target)
            : kind === 'inbox'
              ? await smartInbox(text, { controller })
              : kind === 'log'
                ? await controller.quickLog(text, value, target)
                : kind === 'knowledge'
                  ? await controller.quickKnowledge(text, value, target)
                  : await controller.quickNote(text, target);
        result = res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error };
        if (res.ok && spec) rememberFolder(spec.id, normalizeFolder(place.target.folder) ?? '');
      }
    } catch (err) {
      result = { ok: false, text: err instanceof Error ? err.message : String(err) };
    } finally {
      setBusy(false);
    }
    setStatus(result);
    if (result.ok) {
      haptics.success();
      setText('');
      setExtra('');
      setDue(undefined);
      setRepeat(undefined);
      place.reset();
      if (onDone) timer.current = setTimeout(onDone, DISMISS_DELAY_MS);
    } else {
      haptics.error();
    }
  };

  const canSubmit = text.trim().length > 0;
  const run = () => void submit();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` closes over the fields tracked below
  useEffect(() => {
    onHeaderState?.({ canSubmit, busy, submit: run });
  }, [
    canSubmit,
    busy,
    text,
    extra,
    due,
    repeat,
    place.target.folder,
    place.target.name,
    onHeaderState,
  ]);

  const clearStatus = () => setStatus(null);

  return (
    <Screen
      title={CAPTURE_TITLES[kind]}
      keyboard
      syncStatus={false}
      footer={
        headerAction ? undefined : (
          <Button
            label={busy ? 'Saving' : 'Save'}
            testID="capture-submit"
            loading={busy}
            fullWidth
            onPress={run}
          />
        )
      }
    >
      <TextField
        label={copy.label}
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (status) clearStatus();
        }}
        placeholder={copy.placeholder}
        autoFocus
        autoCapitalize="sentences"
        multiline={copy.multiline}
        returnKeyType={copy.multiline ? 'default' : copy.extra ? 'next' : 'done'}
        onSubmitEditing={copy.multiline || copy.extra ? undefined : run}
        testID="capture-text"
      />
      {copy.extra ? (
        <TextField
          label={copy.extra.label}
          value={extra}
          onChangeText={setExtra}
          placeholder={copy.extra.placeholder}
          helper={copy.extra.helper}
          autoCapitalize={kind === 'knowledge' ? 'sentences' : 'none'}
          returnKeyType="done"
          onSubmitEditing={run}
          testID="capture-extra"
        />
      ) : null}
      {spec ? (
        <CreateTargetRow
          spec={spec}
          state={place}
          appFolder={appFolder}
          paths={paths}
          onSubmit={run}
        />
      ) : null}
      {kind === 'todo' ? (
        <DueEditor
          value={due}
          onChange={(next) => {
            // Clearing the date clears the rule; moving it carries a rule pinned to the old date.
            setRepeat((r) =>
              next && r && due ? retargetRepeat(r, due.date, next.date) : undefined,
            );
            setDue(next);
          }}
          {...(repeat && { repeat })}
          onRepeatChange={setRepeat}
        />
      ) : null}
      {status ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon
            name={status.ok ? 'check' : 'warning'}
            size={18}
            color={status.ok ? colors.success : colors.danger}
          />
          <View style={{ flex: 1 }}>
            <Text variant="subheadline" tone={status.ok ? 'success' : 'danger'}>
              {status.ok ? status.text : `Error: ${status.text}`}
            </Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
