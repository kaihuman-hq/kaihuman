import type { BusinessRepo, Payment } from '@kaihuman/formats/business';
import { useState } from 'react';
import { View } from 'react-native';
import {
  fieldErrors,
  type PaymentField,
  type PaymentForm,
  paymentFromForm,
} from '../business/forms.js';
import { invoiceRows, money } from '../business/summary.js';
import { useTheme } from '../theme/theme.js';
import { Button, EmptyState, haptics, Text, TextField } from '../ui/index.js';
import { INVOICE_STATE_LABEL } from './business-view.js';

export interface BusinessPaymentSheetProps {
  repo: BusinessRepo;
  invoice: string;
  today: string;
  /** Resolves true when saved. */
  onSubmit: (payment: Omit<Payment, 'id'>) => Promise<boolean>;
  onClose: () => void;
}

export function BusinessPaymentSheet({
  repo,
  invoice,
  today,
  onSubmit,
  onClose,
}: BusinessPaymentSheetProps) {
  const { spacing } = useTheme();
  const [form, setForm] = useState<PaymentForm>({ amount: '', date: today, method: '', ref: '' });
  const [errors, setErrors] = useState<Partial<Record<PaymentField, string>>>({});
  const [saving, setSaving] = useState(false);
  const row = invoiceRows(repo, today).find((r) => r.number === invoice);
  if (!row) {
    return (
      <EmptyState
        icon="wallet"
        title="Invoice not found"
        message={`No issued invoice ${invoice}.`}
        action={{ label: 'Close', onPress: onClose }}
      />
    );
  }
  const clientName = repo.clients.find((c) => c.slug === row.client)?.name ?? row.client;
  const open = row.status.open;
  const set = (patch: Partial<PaymentForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const result = paymentFromForm(form, open);
    setErrors(fieldErrors<PaymentField>(result));
    if (!result.ok) {
      haptics.error();
      return;
    }
    setSaving(true);
    const ok = await onSubmit({ invoice, ...result.value });
    setSaving(false);
    if (ok) haptics.success();
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }} testID="business-payment-sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Cancel" variant="plain" size="medium" onPress={onClose} />
        <Text variant="headline" accessibilityRole="header">
          Record payment
        </Text>
        <Button
          label="Save"
          variant="plain"
          size="medium"
          loading={saving}
          onPress={() => void save()}
          testID="business-payment-save"
        />
      </View>
      <View style={{ gap: spacing.xxs }}>
        <Text variant="title3">{`${invoice} · ${clientName}`}</Text>
        <Text variant="footnote" tone="secondary" testID="business-payment-summary">
          {`${INVOICE_STATE_LABEL[row.status.state]} · ${money(row.gross, row.currency)} gross · ${money(open, row.currency)} open${row.dueDate ? ` · due ${row.dueDate}` : ''}`}
        </Text>
      </View>
      <TextField
        label="Amount"
        placeholder={money(open, row.currency)}
        helper="Leave empty to record the open amount."
        value={form.amount}
        onChangeText={(amount) => set({ amount })}
        {...(errors.amount ? { error: errors.amount } : {})}
        keyboardType="decimal-pad"
        testID="business-payment-amount"
      />
      <TextField
        label="Date"
        placeholder="YYYY-MM-DD"
        value={form.date}
        onChangeText={(date) => set({ date })}
        {...(errors.date ? { error: errors.date } : {})}
        autoCapitalize="none"
        testID="business-payment-date"
      />
      <TextField
        label="Method"
        placeholder="Bank transfer"
        value={form.method}
        onChangeText={(method) => set({ method })}
        testID="business-payment-method"
      />
      <TextField
        label="Reference"
        placeholder="Bank reference"
        value={form.ref}
        onChangeText={(ref) => set({ ref })}
        autoCapitalize="none"
        testID="business-payment-ref"
      />
    </View>
  );
}
