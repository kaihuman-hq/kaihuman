import type { Slug } from '@kaihuman/formats/business';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { BusinessState } from '../business/load.js';
import {
  attentionItems,
  clientRows,
  hoursSummary,
  hoursText,
  type InvoiceRow,
  invoiceRows,
  money,
  receivables,
  STAGE_LABEL,
  timerMinutes,
} from '../business/summary.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  Section,
  StatTile,
  Text,
} from '../ui/index.js';

export interface BusinessViewProps {
  /** `null` while loading. */
  state: BusinessState | null;
  now: Date;
  today: string;
  onOpenClient: (slug: Slug) => void;
  onOpenInvoice: (number: string) => void;
  /** Starts the timer for a client picked on the screen. */
  onStartTimer: (client: Slug) => void;
  onLogTime: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const INVOICE_STATE_LABEL: Record<InvoiceRow['status']['state'], string> = {
  issued: 'Issued',
  sent: 'Sent',
  'part-paid': 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  credited: 'Credited',
};

/** Paths that could not be read; the figures below may be incomplete. */
export function FailedNotice({ failed }: { failed: readonly string[] }) {
  if (failed.length === 0) return null;
  return (
    <Card title="Some files are not available offline" icon="warning">
      <Text variant="footnote" tone="secondary" testID="business-failed">
        {`${failed.length} file${failed.length === 1 ? '' : 's'} could not be read, so figures may be incomplete: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ', …' : ''}`}
      </Text>
    </Card>
  );
}

export function BusinessView(props: BusinessViewProps) {
  const { state, now, today, refreshing, onRefresh } = props;
  const { spacing, colors } = useTheme();
  const [picking, setPicking] = useState(false);

  if (state === null) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', padding: spacing.xl }}>
          <ActivityIndicator accessibilityLabel="Loading business" color={colors.secondaryLabel} />
        </View>
      </Screen>
    );
  }
  if (state.status === 'disabled') {
    return (
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <EmptyState
          icon="wallet"
          title="Business is not set up"
          message="Enable it in the console under Business; clients, time and invoices then show here."
        />
      </Screen>
    );
  }

  const { repo } = state;
  const timer = repo.timer;
  const nameOf = (slug: Slug) => repo.clients.find((c) => c.slug === slug)?.name ?? slug;
  const hours = hoursSummary(repo.time, today);
  const attention = attentionItems(repo, today);
  const open = receivables(invoiceRows(repo, today));
  const clients = clientRows(repo, today);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <FailedNotice failed={state.failed} />
      {timer ? (
        <Card title="Timer running" icon="timer">
          <Text variant="headline" testID="business-timer">
            {`${nameOf(timer.client)}${timer.project ? ` / ${timer.project}` : ''} · ${hoursText(timerMinutes(timer.started_at, now))}`}
          </Text>
          {timer.note ? (
            <Text variant="footnote" tone="secondary">
              {timer.note}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Stop"
              icon="stop"
              size="medium"
              onPress={props.onStopTimer}
              testID="business-stop-timer"
            />
            <Button
              label="Discard"
              variant="plain"
              size="medium"
              onPress={props.onCancelTimer}
              testID="business-cancel-timer"
            />
          </View>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {!timer && clients.length > 0 ? (
          <Button
            label="Start timer"
            icon="play"
            variant="tinted"
            size="medium"
            onPress={() => setPicking(!picking)}
            testID="business-start-timer"
          />
        ) : null}
        {clients.length > 0 ? (
          <Button
            label="Log time"
            icon="clock"
            variant="tinted"
            size="medium"
            onPress={props.onLogTime}
            testID="business-log-time"
          />
        ) : null}
      </View>
      {picking && !timer ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
          testID="business-timer-clients"
        >
          {clients
            .filter((c) => c.stage !== 'past' && c.stage !== 'lost')
            .map((c) => (
              <Chip
                key={c.slug}
                label={c.name}
                icon="play"
                accessibilityLabel={`Start timer for ${c.name}`}
                onPress={() => {
                  setPicking(false);
                  props.onStartTimer(c.slug);
                }}
              />
            ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="business-hours">
        <View style={{ flex: 1 }}>
          <StatTile label="Today" value={hoursText(hours.today)} />
        </View>
        <View style={{ flex: 1 }}>
          <StatTile label="This week" value={hoursText(hours.week)} />
        </View>
        <View style={{ flex: 1 }}>
          <StatTile label="This month" value={hoursText(hours.month)} />
        </View>
      </View>
      {attention.length > 0 ? (
        <Section header="Needs attention">
          {attention.map((item) => (
            <ListRow
              key={item.key}
              testID={`business-attention-${item.key}`}
              title={item.title}
              subtitle={item.detail}
              icon={item.tone === 'warning' ? 'warning' : 'flag'}
              iconTone={item.tone === 'warning' ? 'danger' : 'warning'}
              accessory="chevron"
              onPress={() =>
                item.target.kind === 'invoice'
                  ? props.onOpenInvoice(item.target.number)
                  : props.onOpenClient(item.target.slug)
              }
            />
          ))}
        </Section>
      ) : null}
      {open.length > 0 ? (
        <Section header="Open invoices">
          {open.map((r) => (
            <ListRow
              key={r.number}
              testID={`business-invoice-${r.number}`}
              title={`${r.number} · ${nameOf(r.client)}`}
              subtitle={`${INVOICE_STATE_LABEL[r.status.state]}${r.dueDate ? `, due ${r.dueDate}` : ''}`}
              value={money(r.status.open, r.currency)}
              icon="wallet"
              iconTone={r.status.state === 'overdue' ? 'danger' : 'info'}
              accessory="chevron"
              onPress={() => props.onOpenInvoice(r.number)}
            />
          ))}
        </Section>
      ) : null}
      <Section header="Clients">
        {clients.length === 0 ? (
          <EmptyState
            icon="empty"
            title="No clients yet"
            message="Add your first client in the console."
          />
        ) : (
          clients.map((c) => (
            <ListRow
              key={c.slug}
              testID={`business-client-${c.slug}`}
              title={c.name}
              subtitle={[
                STAGE_LABEL[c.stage],
                c.open > 0 ? `${money(c.open, c.currency)} open` : '',
                c.unbilledMinutes > 0 ? `${hoursText(c.unbilledMinutes)} unbilled` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              icon="repos"
              iconTone={c.stage === 'active' ? 'success' : 'neutral'}
              accessory="chevron"
              onPress={() => props.onOpenClient(c.slug)}
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
