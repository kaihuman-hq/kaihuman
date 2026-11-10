import { useEffect, useMemo, useState } from 'react';
import { appIntelligence } from '../intelligence/app-model.js';
import { githubCaptureFiles } from '../intelligence/save-capture.js';
import {
  describeScanEntry,
  SCAN_KINDS,
  SCAN_LABELS,
  type ScanEntry,
  type ScanKind,
  saveScanEntry,
  scanTextToEntry,
} from '../intelligence/scan.js';
import { QuickCaptureController } from '../screens/quick-capture.js';
import { Button, haptics, Screen, SegmentedControl, Text, TextField } from '../ui/index.js';

const KIND_OPTIONS = SCAN_KINDS.map((value) => ({ value, label: SCAN_LABELS[value] }));

/** Scan to entry: document camera (or Visual Intelligence text) -> Vision OCR -> model -> entry. */
export function ScanView({
  initialText,
  initialKind,
}: {
  initialText?: string;
  initialKind?: ScanKind;
}) {
  const controller = useMemo(() => new QuickCaptureController(), []);
  const [text, setText] = useState(initialText ?? '');
  const [kind, setKind] = useState<ScanKind>(initialKind ?? 'budget');
  const [entry, setEntry] = useState<ScanEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const parse = async (source: string, prefer: ScanKind) => {
    setBusy(true);
    const res = await scanTextToEntry(source, {
      model: appIntelligence().model,
      now: new Date(),
      prefer,
    });
    setBusy(false);
    setEntry(res.entry);
    if (res.entry) setKind(res.entry.kind);
    setStatus(
      res.source === 'plain'
        ? { ok: true, text: 'Apple Intelligence is off: saved as a todo.' }
        : null,
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: parse once for the text a link brought
  useEffect(() => {
    if (initialText) void parse(initialText, initialKind ?? 'budget');
  }, []);

  const scan = async () => {
    const recognised = await appIntelligence()
      .recognizeDocument(null)
      .catch(() => null);
    if (!recognised) return;
    setText(recognised);
    await parse(recognised, kind);
  };

  const save = async () => {
    if (!entry) return;
    setBusy(true);
    const res = await saveScanEntry(entry, { controller, files: githubCaptureFiles });
    setBusy(false);
    setStatus(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    if (res.ok) {
      haptics.success();
      setEntry(null);
    } else haptics.error();
  };

  return (
    <Screen
      title="Scan"
      keyboard
      syncStatus={false}
      footer={
        <Button
          label="Save"
          fullWidth
          disabled={!entry}
          loading={busy}
          onPress={() => void save()}
          testID="scan-save"
        />
      }
    >
      <Button
        label="Scan document"
        icon="capture"
        variant="tinted"
        onPress={() => void scan()}
        testID="scan-camera"
      />
      <SegmentedControl
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          if (text.trim()) void parse(text, next);
        }}
      />
      <TextField
        label="Recognised text"
        value={text}
        onChangeText={setText}
        multiline
        testID="scan-text"
      />
      <Button
        label="Read again"
        variant="tinted"
        disabled={!text.trim() || busy}
        onPress={() => void parse(text, kind)}
      />
      {entry ? <Text variant="headline">{describeScanEntry(entry)}</Text> : null}
      {status ? <Text tone={status.ok ? 'success' : 'danger'}>{status.text}</Text> : null}
    </Screen>
  );
}
