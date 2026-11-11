import {
  CSV_PAGE_SIZE,
  type CsvFilters,
  type CsvSort,
  csvCellText,
  csvTableRows,
  isComplexCell,
  nextCsvSort,
  pageCsvRows,
  parseCsvTable,
  setCsvFilter,
} from '@kaihuman/formats';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Button, Icon, KeyboardLift, Text, TextField } from '../ui/index.js';

const CELL_WIDTH = 140;

/** Full text of a cell for the detail sheet: objects pretty-printed, nothing clipped. */
const fullText = (v: unknown): string =>
  isComplexCell(v) ? JSON.stringify(v, null, 2) : String(v ?? '');

function Sheet({
  title,
  onClose,
  children,
  testID,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testID: string;
}) {
  const { colors, spacing, shape } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <KeyboardLift>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}
        >
          {/* Swallows presses so taps inside the sheet do not dismiss it. */}
          <Pressable
            accessible={false}
            testID={testID}
            style={{
              backgroundColor: colors.surface,
              padding: spacing.lg,
              gap: spacing.sm,
              maxHeight: '80%',
              borderTopLeftRadius: shape.lg,
              borderTopRightRadius: shape.lg,
            }}
          >
            <Text variant="headline">{title}</Text>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

/**
 * Sortable, filterable, paged table for any CSV text (widget files and generic CSVs alike), with
 * the web CsvTableView's behaviour: tap a header to sort, filter per column in a sheet, 50 rows a
 * page, tap a row for every column in a detail sheet.
 */
export function CsvDataTable({ content, delimiter }: { content: string; delimiter?: string }) {
  const { colors, spacing, shape } = useTheme();
  const { headers, rows } = useMemo(() => parseCsvTable(content, delimiter), [content, delimiter]);
  const [sort, setSort] = useState<CsvSort | null>(null);
  const [filters, setFilters] = useState<CsvFilters>({});
  const [page, setPage] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [detail, setDetail] = useState<unknown[] | null>(null);

  const shown = useMemo(() => csvTableRows(rows, filters, sort), [rows, filters, sort]);
  const paged = pageCsvRows(shown, page);
  const activeFilters = Object.keys(filters).length;

  if (headers.length === 0 && rows.length === 0) {
    return <Text tone="secondary">Empty file</Text>;
  }

  const cell = (text: string, key: number, head: boolean, suffix = '') => (
    <View key={key} style={{ width: CELL_WIDTH, paddingHorizontal: spacing.sm }}>
      <Text variant="footnote" weight={head ? '600' : '400'} mono={!head} numberOfLines={2}>
        {text + suffix}
      </Text>
    </View>
  );

  return (
    <View testID="reader-csv" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="footnote" tone="secondary">
          {`${shown.length} ${shown.length === 1 ? 'row' : 'rows'}`}
        </Text>
        <Pressable
          testID="csv-filter-button"
          accessibilityRole="button"
          accessibilityLabel={activeFilters ? `Filters (${activeFilters})` : 'Filters'}
          onPress={() => setFiltering(true)}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
        >
          <Icon
            name="filter"
            size={20}
            color={activeFilters ? colors.accent : colors.secondaryLabel}
          />
          {activeFilters ? (
            <Text variant="footnote" tone="accent">
              {String(activeFilters)}
            </Text>
          ) : null}
        </Pressable>
      </View>
      <ScrollView
        horizontal
        accessibilityLabel="Table"
        style={{ backgroundColor: colors.surface, borderRadius: shape.md }}
      >
        <View style={{ paddingVertical: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              paddingBottom: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.separator,
            }}
          >
            {headers.map((h, i) => {
              const arrow = sort?.key === i ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <Pressable
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${h}`}
                  onPress={() => {
                    setSort(nextCsvSort(sort, i));
                    setPage(0);
                  }}
                >
                  {cell(h, i, true, arrow)}
                </Pressable>
              );
            })}
          </View>
          {paged.rows.map((row, r) => (
            <Pressable
              // biome-ignore lint/suspicious/noArrayIndexKey: page-relative index is stable per render
              key={r}
              accessibilityRole="button"
              accessibilityLabel={`Row ${paged.page * CSV_PAGE_SIZE + r + 1}`}
              onPress={() => setDetail(row)}
              style={{ flexDirection: 'row', paddingTop: spacing.sm }}
            >
              {headers.map((_, c) => cell(csvCellText(row[c]), c, false))}
            </Pressable>
          ))}
          {paged.rows.length === 0 ? (
            <View style={{ padding: spacing.md }}>
              <Text tone="secondary">No data found</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {paged.totalPages > 1 ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Button
            label="Prev"
            variant="plain"
            size="small"
            disabled={paged.page === 0}
            onPress={() => setPage(paged.page - 1)}
          />
          <Text variant="footnote" tone="secondary">
            {`${paged.page + 1} / ${paged.totalPages}`}
          </Text>
          <Button
            label="Next"
            variant="plain"
            size="small"
            disabled={paged.page >= paged.totalPages - 1}
            onPress={() => setPage(paged.page + 1)}
          />
        </View>
      ) : null}
      {filtering ? (
        <Sheet title="Filter columns" testID="csv-filter-sheet" onClose={() => setFiltering(false)}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {headers.map((h, i) => (
              <TextField
                // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                key={i}
                label={h}
                value={filters[i] ?? ''}
                placeholder={`Filter ${h}…`}
                onChangeText={(text) => {
                  setPage(0);
                  setFilters((f) => setCsvFilter(f, i, text));
                }}
                testID={`csv-filter-${i}`}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Clear"
              variant="plain"
              disabled={activeFilters === 0}
              onPress={() => setFilters({})}
            />
            <Button label="Done" onPress={() => setFiltering(false)} />
          </View>
        </Sheet>
      ) : null}
      {detail ? (
        <Sheet title="Row details" testID="csv-detail-sheet" onClose={() => setDetail(null)}>
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            {headers.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
              <View key={i}>
                <Text variant="footnote" tone="secondary">
                  {h}
                </Text>
                <Text mono>{fullText(detail[i])}</Text>
              </View>
            ))}
          </ScrollView>
          <Button label="Close" variant="plain" onPress={() => setDetail(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}
