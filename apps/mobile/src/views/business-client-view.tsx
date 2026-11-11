import type { Slug } from '@kaihuman/formats/business';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { BusinessState } from '../business/load.js';
import { clientDetail, hoursText, money, STAGE_LABEL } from '../business/summary.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  Chip,
  EmptyState,
  haptics,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  Text,
  TextField,
} from '../ui/index.js';
import { FailedNotice, INVOICE_STATE_LABEL } from './business-view.js';

export interface BusinessClientViewProps {
  state: BusinessState | null;
  slug: string;
  today: string;
  /** Resolves true when the line was saved, so the field clears. */
  onAddLine: (kind: 'todo' | 'log', text: string) => Promise<boolean>;
  onStartTimer: (project?: Slug) => void;
  onLogTime: (project?: Slug) => void;
  onOpenInvoice: (number: string) => void;
  onOpenFile: (path: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const FILE_TITLE = { notes: 'Notes', todos: 'Todos', log: 'Log' } as const;
const FILE_ICON = { notes: 'note', todos: 'todo', log: 'log' } as const;
const LINE_KINDS = ['todo', 'log'] as const;

export function BusinessClientView(props: BusinessClientViewProps) {
  const { state, slug, today, refreshing, onRefresh } = props;
  const { spacing, colors } = useTheme();
  const [kind, setKind] = useState<'todo' | 'log'>('todo');
  const [text, setText] = useState('');
  const [project, setProject] = useState<Slug | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  if (state === null) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', padding: spacing.xl }}>
          <ActivityIndicator accessibilityLabel="Loading client" color={colors.secondaryLabel} />
        </View>
      </Screen>
    );
  }
  const detail = state.status === 'ready' ? clientDetail(state.repo, slug, today) : null;
  if (state.status !== 'ready' || !detail) {
    return (
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <EmptyState
          icon="empty"
          title="Client not found"
          message="It may have been renamed or removed."
        />
      </Screen>
    );
  }
  const { client, row, projects, invoices, recentTime, files } = detail;
  const timer = state.repo.timer;

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    const ok = await props.onAddLine(kind, text);
    setSaving(false);
    if (ok) {
      haptics.success();
      setText('');
    } else haptics.error();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} keyboard>
      <FailedNotice failed={state.failed} />
      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {client.name}
        </Text>
        <Text variant="subheadline" tone="secondary" testID="business-client-summary">
          {[
            STAGE_LABEL[client.stage],
            `${money(row.open, row.currency)} open`,
            `${hoursText(row.unbilledMinutes)} unbilled`,
          ].join(' · ')}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        <SegmentedControl
          options={LINE_KINDS.map((k) => ({ value: k, label: k === 'todo' ? 'Todo' : 'Log' }))}
          value={kind}
          onChange={setKind}
        />
        <TextField
          label={kind === 'todo' ? 'New todo' : 'Log entry'}
          placeholder={kind === 'todo' ? 'What needs doing? #tags work' : 'What happened?'}
          value={text}
          onChangeText={setText}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          testID="business-line-input"
        />
        <Button
          label={kind === 'todo' ? 'Add todo' : 'Add log entry'}
          size="medium"
          disabled={!text.trim()}
          loading={saving}
          onPress={() => void submit()}
          testID="business-line-submit"
        />
      </View>
      {projects.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {projects.map((p) => (
            <Chip
              key={p.slug}
              label={p.name}
              selected={project === p.slug}
              accessibilityLabel={`Project ${p.name}`}
              onPress={() => setProject(project === p.slug ? undefined : p.slug)}
            />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {timer ? null : (
          <Button
            label="Start timer"
            icon="play"
            variant="tinted"
            size="medium"
            onPress={() => props.onStartTimer(project)}
            testID="business-client-start-timer"
          />
        )}
        <Button
          label="Log time"
          icon="clock"
          variant="tinted"
          size="medium"
          onPress={() => props.onLogTime(project)}
          testID="business-client-log-time"
        />
      </View>
      {invoices.length > 0 ? (
        <Section header="Invoices">
          {invoices.map((r) => {
            const payable = r.status.open > 0 && r.status.state !== 'credited';
            return (
              <ListRow
                key={r.number}
                testID={`business-client-invoice-${r.number}`}
                title={r.number}
                subtitle={`${INVOICE_STATE_LABEL[r.status.state]} · ${r.issueDate}${payable ? ' · tap to record a payment' : ''}`}
                value={money(payable ? r.status.open : r.gross, r.currency)}
                icon="wallet"
                iconTone={r.status.state === 'overdue' ? 'danger' : payable ? 'info' : 'success'}
                accessory={payable ? 'chevron' : 'none'}
                {...(payable ? { onPress: () => props.onOpenInvoice(r.number) } : {})}
              />
            );
          })}
        </Section>
      ) : null}
      {recentTime.length > 0 ? (
        <Section header="Recent time">
          {recentTime.map((t) => (
            <ListRow
              key={t.id}
              title={t.note}
              subtitle={`${t.date}${t.project ? ` · ${t.project}` : ''}${t.invoice ? ` · billed ${t.invoice}` : ''}`}
              value={hoursText(t.minutes)}
              icon="clock"
              iconTone="neutral"
            />
          ))}
        </Section>
      ) : null}
      {files.length > 0 ? (
        <Section header="Files">
          {files.map((f) => (
            <ListRow
              key={f.path}
              testID={`business-client-file-${f.kind}`}
              title={FILE_TITLE[f.kind]}
              icon={FILE_ICON[f.kind]}
              iconTone="info"
              accessory="chevron"
              onPress={() => props.onOpenFile(f.path)}
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
