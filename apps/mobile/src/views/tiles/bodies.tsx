import { useState } from 'react';
import { View } from 'react-native';
import {
  addEvent,
  addTodoTask,
  type EventRow,
  eventDateParts,
  groupEventsByDay,
  type TileResult,
  type TodosView,
  toggleTodo,
} from '../../components/widgets/tile-controllers.js';
import { dueBadge } from '../../screens/todo-due.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, haptics, Icon, Text, TextField } from '../../ui/index.js';
import { CheckCircle, EmptyLine, ItemRow, QuickAdd, Rows, useDisclosure } from './parts.js';

export interface Ctx {
  content: string;
  now: Date;
  /** Writes a mutator's result and shows its error, if it was rejected. */
  apply: (result: string | TileResult) => boolean;
  error: string | null;
}


export function Todos({ view, ctx }: { view: TodosView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState('');
  const add = () => {
    if (ctx.apply(addTodoTask(ctx.content, text, ctx.now))) {
      haptics.success();
      setText('');
    } else haptics.error();
  };
  return (
    <>
      {view.rows.length === 0 ? (
        <EmptyLine>All clear. Nothing to do.</EmptyLine>
      ) : (
        <Rows>
          {view.rows.map((r) => {
            const done = r.status === 'done' || r.status === 'rejected';
            const due = dueBadge(r, ctx.now);
            return (
              <ItemRow
                key={r.id}
                trailing={
                  due ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {due.repeat ? (
                        <Icon
                          name="repeat"
                          size={14}
                          color={colors.secondaryLabel}
                          accessibilityLabel={`Repeats ${due.repeat}`}
                        />
                      ) : null}
                      <Badge tone={due.tone} label={due.label} />
                    </View>
                  ) : undefined
                }
                testID={`todo-${r.index}`}
                role="checkbox"
                checked={done}
                title={r.text}
                done={done}
                subtitle={r.milestone}
                leading={<CheckCircle on={done} />}
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
      <QuickAdd
        label="New task"
        placeholder="What needs doing?"
        value={text}
        onChangeText={setText}
        onSubmit={add}
        addLabel="Add task"
      />
    </>
  );
}

export function Events({ rows, ctx }: { rows: EventRow[]; ctx: Ctx }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const form = useDisclosure();
  const { colors, spacing, shape } = useTheme();
  const save = () => {
    if (ctx.apply(addEvent(ctx.content, { name, startDate: date }))) {
      haptics.success();
      setName('');
      setDate('');
      form.hide();
    } else haptics.error();
  };
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
      {form.open ? (
        <>
          <TextField
            label="Event name"
            value={name}
            onChangeText={setName}
            autoCapitalize="sentences"
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Save event" size="medium" onPress={save} />
            <Button label="Cancel" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </>
      ) : (
        <Button label="Add event" icon="add" size="medium" variant="tinted" onPress={form.show} />
      )}
    </>
  );
}
