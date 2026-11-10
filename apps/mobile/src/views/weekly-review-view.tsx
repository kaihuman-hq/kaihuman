import { useRouter } from 'expo-router';
import { useState } from 'react';
import { appIntelligence } from '../intelligence/app-model.js';
import { githubCaptureFiles } from '../intelligence/save-capture.js';
import { writeWeeklyReview } from '../intelligence/weekly-review.js';
import { Button, Screen, Text } from '../ui/index.js';

const SOURCE_COPY = {
  server: 'Written with Private Cloud Compute.',
  device: 'Written on this device.',
  template: 'Apple Intelligence is off: wrote the summary template.',
} as const;

/** Writes `logs/weekly-review-<date>.md` and opens it in the editor. */
export function WeeklyReviewView() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const { path, source } = await writeWeeklyReview({
        files: githubCaptureFiles,
        model: appIntelligence().model,
        now: new Date(),
      });
      setStatus({ ok: true, text: SOURCE_COPY[source] });
      router.push(`/files/${path.split('/').map(encodeURIComponent).join('/')}` as never);
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Weekly review">
      <Text>
        Summarises the last seven days: done todos, habit streaks, time tracked, spend and open
        loops. Saved to logs/ so you can edit it.
      </Text>
      <Button
        label="Write weekly review"
        loading={busy}
        fullWidth
        onPress={() => void run()}
        testID="weekly-review-run"
      />
      {status ? <Text tone={status.ok ? 'success' : 'danger'}>{status.text}</Text> : null}
    </Screen>
  );
}
