import { useState } from 'react';
import { View } from 'react-native';
import {
  addEvent,
  type EventRow,
  eventDateParts,
  groupEventsByDay,
  type ReadLaterDraft,
  type TileResult,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { haptics, Icon, Text, TextField } from '../../ui/index.js';
import { EmptyLine, FormButtons, ItemRow, Rows } from './parts.js';

export interface Ctx {
  content: string;
  now: Date;
  /** Writes a mutator's result and shows its error, if it was rejected. */
  apply: (result: string | TileResult) => boolean;
  error: string | null;
  /** The tile's own file path; lets a tile place related files beside it. */
  path?: string;
  /** Saves an RSS item to the read-later file; absent where no file store is wired. */
  readLater?: (draft: ReadLaterDraft) => Promise<'added' | 'duplicate'>;
  /** Creates another repository file (e.g. a todo's prompt file). */
  createFile?: (path: string, content: string) => Promise<void>;
  /** Opens a repository file in the editor. */
  openFile?: (path: string) => void;
}

/** An add form shown in the tile's ＋ sheet; `onDone` closes the sheet. */
export interface AddFormProps {
  ctx: Ctx;
  onDone: () => void;
}

export function EventAddForm({ ctx, onDone }: AddFormProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const save = () => {
    if (ctx.apply(addEvent(ctx.content, { name, startDate: date }))) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label="Event name"
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
        autoFocus
        returnKeyType="next"
      />
      <TextField
        label="Event date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        placeholder="2026-12-24"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <FormButtons saveLabel="Save event" onSave={save} onCancel={onDone} />
    </>
  );
}

export function Events({ rows }: { rows: EventRow[]; ctx: Ctx }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <>
      {rows.length === 0 ? (
        <EmptyLine>No upcoming events.</EmptyLine>
      ) : (
        groupEventsByDay(rows).map((group) => (
          <View key={group.title} testID={`events-day-${group.title}`}>
            <Text variant="footnote" weight="600" tone="secondary" accessibilityRole="header">
              {group.title}
            </Text>
            <Rows>
              {group.rows.map((r) => {
                const { day, month } = eventDateParts(r.date);
                const soon = r.daysUntil <= 1;
                return (
                  <ItemRow
                    key={`${r.date}-${r.name}`}
                    title={r.name}
                    subtitle={r.turns ? `Turns ${r.turns} · ${r.label}` : r.label}
                    label={`${r.name}, ${r.label}`}
                    leading={
                      <View
                        accessibilityElementsHidden
                        style={{
                          width: 48,
                          paddingVertical: spacing.xs,
                          borderRadius: shape.md,
                          alignItems: 'center',
                          backgroundColor: soon ? colors.accentSoft : colors.fill,
                        }}
                      >
                        <Text variant="title3" weight="700" mono>
                          {day}
                        </Text>
                        <Text variant="caption2" tone="secondary">
                          {month.toUpperCase()}
                        </Text>
                      </View>
                    }
                    trailing={
                      r.kind === 'birthday' ? (
                        <Icon name="star" size={18} color={colors.accent} />
                      ) : undefined
                    }
                  />
                );
              })}
            </Rows>
          </View>
        ))
      )}
    </>
  );
}

export { Todos } from './todos-body.js';
