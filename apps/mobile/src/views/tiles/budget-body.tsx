import { localDate } from '@kaihuman/formats';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  addBudgetTransaction,
  BUDGET_CATEGORIES,
  budgetDetail,
} from '../../components/widgets/budget-tile.js';
import { Button, Chip, haptics, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, Meter, Rows, Stat, StatRow, useDisclosure } from './parts.js';

const num = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`;

const Heading = ({ children }: { children: string }) => (
  <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
    {children}
  </Text>
);

const ChipWrap = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
);

/** Picks one of the values already in the file, or "New…" to type a fresh one. */
function ValuePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(options.length === 0);
  return (
    <View style={{ gap: 8 }}>
      <Heading>{label}</Heading>
      {options.length > 0 ? (
        <ChipWrap>
          {options.map((o) => (
            <Chip
              key={o}
              label={o}
              selected={!custom && value === o}
              onPress={() => {
                setCustom(false);
                onChange(o);
              }}
            />
          ))}
          <Chip
            label="New…"
            icon="add"
            selected={custom}
            accessibilityLabel={`New ${label.toLowerCase()}`}
            onPress={() => {
              setCustom(true);
              onChange('');
            }}
          />
        </ChipWrap>
      ) : null}
      {custom ? (
        <TextField
          label={`${label} (new)`}
          value={value}
          onChangeText={onChange}
          returnKeyType="next"
        />
      ) : null}
    </View>
  );
}

export function Budget({ ctx }: { ctx: Ctx }) {
  const [account, setAccount] = useState<string | null>(null);
  const detail = useMemo(() => budgetDetail(ctx.content, account), [ctx.content, account]);
  const { summary } = detail;
  const max = Math.max(1, ...summary.categories.map((c) => c.value));
  const form = useDisclosure();
  const [name, setName] = useState('');
  const [txAccount, setTxAccount] = useState('');
  const [category, setCategory] = useState(BUDGET_CATEGORIES[0]?.id ?? 'earnings');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(localDate(ctx.now));
  const [added, setAdded] = useState<string | null>(null);

  const save = () => {
    if (
      ctx.apply(
        addBudgetTransaction(ctx.content, { name, account: txAccount, category, value, date }),
      )
    ) {
      haptics.success();
      setAdded(name.trim());
      // The form stays open for the next entry; account, category and date usually repeat.
      setName('');
      setValue('');
    } else haptics.error();
  };

  return (
    <>
      <View style={{ gap: 2 }} accessible accessibilityLabel={`Balance ${signed(summary.net)}`}>
        <Heading>{account ? `Balance · ${account}` : 'Total balance'}</Heading>
        <Text
          variant="largeTitle"
          mono
          tone={summary.net < 0 ? 'danger' : 'primary'}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {num(summary.net)}
        </Text>
      </View>
      <StatRow>
        <Stat label="Income" value={num(summary.income)} />
        <Stat label="Spending" value={num(summary.spending)} />
        <Stat
          label="Net"
          value={signed(summary.net)}
          tone={summary.net < 0 ? 'danger' : 'success'}
        />
      </StatRow>

      {detail.accounts.length > 1 || account ? (
        <View style={{ gap: 8 }}>
          <Heading>Accounts</Heading>
          <ChipWrap>
            <Chip label="All" selected={account === null} onPress={() => setAccount(null)} />
            {detail.accounts.map((a) => (
              <Chip
                key={a.id}
                label={`${a.id} ${signed(a.value)}`}
                accessibilityLabel={`Account ${a.id}`}
                selected={account === a.id}
                onPress={() => setAccount(a.id)}
              />
            ))}
          </ChipWrap>
        </View>
      ) : null}

      {summary.categories.length > 0 ? (
        <View style={{ gap: 12, paddingTop: 4 }}>
          <Heading>Spending by category</Heading>
          {summary.categories.map((c) => (
            <View key={c.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="subheadline">{c.id}</Text>
                </View>
                <Text
                  variant="subheadline"
                  mono
                  tone="secondary"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {num(c.value)}
                </Text>
              </View>
              <Meter value={c.value / max} label={`${c.id} spending`} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        <Heading>Recent</Heading>
        {detail.recent.length === 0 ? (
          <EmptyLine>No transactions yet.</EmptyLine>
        ) : (
          <Rows>
            {detail.recent.map((t) => (
              <ItemRow
                key={`${t.name}|${t.account}|${t.category}`}
                title={t.name}
                subtitle={`${t.date} · ${t.account} · ${t.category}`}
                trailing={
                  <Text
                    variant="body"
                    mono
                    tone={t.income ? 'success' : 'primary'}
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {t.income ? `+${num(t.value)}` : `-${num(t.value)}`}
                  </Text>
                }
              />
            ))}
          </Rows>
        )}
      </View>

      {form.open ? (
        <View style={{ gap: 16 }}>
          <ValuePicker label="Name" options={detail.names} value={name} onChange={setName} />
          <ValuePicker
            label="Account"
            options={detail.accountNames}
            value={txAccount}
            onChange={setTxAccount}
          />
          <View style={{ gap: 8 }}>
            <Heading>Category</Heading>
            <ChipWrap>
              {BUDGET_CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  selected={category === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </ChipWrap>
          </View>
          <TextField
            label="Amount"
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="0.00"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <TextField
            label="Date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
          />
          {added ? <Text variant="footnote" tone="success">{`Added ${added}`}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Add transaction" size="medium" onPress={save} />
            <Button label="Done" size="medium" variant="plain" onPress={form.hide} />
          </View>
        </View>
      ) : (
        <Button
          label="Add transaction"
          icon="add"
          size="medium"
          variant="tinted"
          onPress={form.show}
        />
      )}
    </>
  );
}
