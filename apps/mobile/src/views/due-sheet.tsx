import type { TodoDue, TodoRepeat } from '@kaihuman/formats';
import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { dueFromPreset, retargetRepeat } from '../screens/todo-due.js';
import { useTheme } from '../theme/theme.js';
import { Button, Text } from '../ui/index.js';
import { DueEditor } from './due-editor.js';

/**
 * Board "Due" menu: Today, Tomorrow, Pick… (native picker plus repeat), and Clear when a due is
 * set. The presets keep the todo's repeat; Pick… saves the repeat edited alongside the date.
 */
export function DueSheet({
  title,
  current,
  currentRepeat,
  onSelect,
  onClose,
  now = new Date(),
}: {
  title: string;
  current: TodoDue | undefined;
  currentRepeat?: TodoRepeat;
  /**
   * `undefined` clears the due date (and with it the repeat). `repeat` is given only by Pick…:
   * a rule replaces the todo's, `null` clears it.
   */
  onSelect: (due: TodoDue | undefined, repeat?: TodoRepeat | null) => void;
  onClose: () => void;
  now?: Date;
}) {
  const { colors, spacing, shape } = useTheme();
  const [draft, setDraft] = useState<TodoDue | undefined>(current);
  const [repeat, setRepeat] = useState<TodoRepeat | undefined>(currentRepeat);
  const [picking, setPicking] = useState(false);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
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
            padding: spacing.lg,
            gap: spacing.sm,
            borderTopLeftRadius: shape.lg,
            borderTopRightRadius: shape.lg,
          }}
        >
          <Text variant="headline" numberOfLines={2}>
            {`Due: ${title}`}
          </Text>
          {picking ? (
            <>
              <DueEditor
                value={draft}
                onChange={(next) => {
                  setRepeat((r) =>
                    next && r && draft ? retargetRepeat(r, draft.date, next.date) : undefined,
                  );
                  setDraft(next);
                }}
                {...(repeat && { repeat })}
                onRepeatChange={setRepeat}
                now={now}
              />
              <Button
                label="Save"
                testID="due-save"
                disabled={!draft}
                onPress={() => onSelect(draft, repeat ?? null)}
                fullWidth
              />
            </>
          ) : (
            <>
              <Button
                label="Today"
                testID="due-today"
                variant="tinted"
                fullWidth
                onPress={() => onSelect(dueFromPreset('today', now))}
              />
              <Button
                label="Tomorrow"
                testID="due-tomorrow"
                variant="tinted"
                fullWidth
                onPress={() => onSelect(dueFromPreset('tomorrow', now))}
              />
              <Button
                label="Pick…"
                testID="due-pick"
                variant="tinted"
                fullWidth
                onPress={() => setPicking(true)}
              />
              {current ? (
                <Button
                  label="Clear due date"
                  testID="due-clear-all"
                  variant="plain"
                  fullWidth
                  onPress={() => onSelect(undefined)}
                />
              ) : null}
            </>
          )}
          <Button label="Cancel" variant="plain" fullWidth onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
