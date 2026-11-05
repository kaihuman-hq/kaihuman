import { useState } from 'react';
import type { QuickKind } from '../navigation/routes.js';
import type { QuickCaptureController } from '../screens/quick-capture.js';
import { Body, Button, Field, Muted, Screen, Title } from './primitives.js';

const TITLES: Record<QuickKind, string> = {
  todo: 'Quick todo',
  note: 'Quick note',
  log: 'Quick log',
  idea: 'Quick idea',
  knowledge: 'Quick knowledge',
};

type Status = { ok: boolean; text: string } | null;

export function QuickCaptureView({
  controller,
  kind,
}: {
  controller: QuickCaptureController;
  kind: QuickKind;
}) {
  const [text, setText] = useState('');
  const [extra, setExtra] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // Todo/log take tags; knowledge takes a title; idea takes a slug.
  const extraLabel = { todo: 'Tags', log: 'Tags', knowledge: 'Title', idea: 'Slug' }[
    kind as string
  ];

  const submit = async () => {
    setBusy(true);
    try {
      const value = extra.trim() || undefined;
      if (kind === 'idea') {
        const res = await controller.quickIdea(text, value ? { slug: value } : {});
        setStatus(
          res.ok
            ? { ok: true, text: `Saved ${res.results.map((r) => r.path).join(', ')}` }
            : { ok: false, text: res.error },
        );
      } else {
        const res =
          kind === 'todo'
            ? await controller.quickTodo(text, value)
            : kind === 'log'
              ? await controller.quickLog(text, value)
              : kind === 'knowledge'
                ? await controller.quickKnowledge(text, value)
                : await controller.quickNote(text);
        setStatus(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
        if (res.ok) {
          setText('');
          setExtra('');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Title>{TITLES[kind]}</Title>
      <Field
        label="Text"
        value={text}
        onChangeText={setText}
        multiline={kind !== 'todo' && kind !== 'log'}
        testID="capture-text"
      />
      {extraLabel ? (
        <Field label={extraLabel} value={extra} onChangeText={setExtra} testID="capture-extra" />
      ) : null}
      <Button label="Save" testID="capture-submit" disabled={busy} onPress={() => void submit()} />
      {status ? (
        <Body>{status.ok ? status.text : `Error: ${status.text}`}</Body>
      ) : (
        <Muted>Saved to your repository</Muted>
      )}
    </Screen>
  );
}
