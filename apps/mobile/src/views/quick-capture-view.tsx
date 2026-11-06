import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { QuickKind } from '../navigation/routes.js';
import type { QuickCaptureController } from '../screens/quick-capture.js';
import { useTheme } from '../theme/theme.js';
import { Button, haptics, Icon, Screen, Text, TextField } from '../ui/index.js';

export const CAPTURE_TITLES: Record<QuickKind, string> = {
  todo: 'New todo',
  note: 'New note',
  log: 'New log entry',
  idea: 'New idea',
  knowledge: 'New knowledge',
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
  onDone,
  headerAction,
  onHeaderState,
}: {
  controller: QuickCaptureController;
  kind: QuickKind;
  /** Called shortly after a successful save so the sheet can dismiss. */
  onDone?: () => void;
  /** True when the header owns the primary action; the view then draws no button. */
  headerAction?: boolean;
  onHeaderState?: (state: CaptureHeaderState) => void;
}) {
  const { spacing, colors } = useTheme();
  const [text, setText] = useState('');
  const [extra, setExtra] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copy = COPY[kind];

  useEffect(() => () => clearTimeout(timer.current), []);

  const submit = async () => {
    if (busy) return;
    haptics.light();
    setBusy(true);
    let result: Status;
    try {
      const value = extra.trim() || undefined;
      if (kind === 'idea') {
        const res = await controller.quickIdea(text, value ? { slug: value } : {});
        result = res.ok
          ? { ok: true, text: `Saved ${res.results.map((r) => r.path).join(', ')}` }
          : { ok: false, text: res.error };
      } else {
        const res =
          kind === 'todo'
            ? await controller.quickTodo(text, value)
            : kind === 'log'
              ? await controller.quickLog(text, value)
              : kind === 'knowledge'
                ? await controller.quickKnowledge(text, value)
                : await controller.quickNote(text);
        result = res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error };
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
  }, [canSubmit, busy, text, extra, onHeaderState]);

  const clearStatus = () => setStatus(null);

  return (
    <Screen
      title={CAPTURE_TITLES[kind]}
      keyboard
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
