import type { ComponentType } from 'react';
import type { TileKind } from '../../components/widgets/tile-controllers.js';
import { ActionLogAddForm } from './actionlog-body.js';
import { type AddFormProps, type Ctx, EventAddForm } from './bodies.js';
import { BookmarkAddForm } from './bookmarks-body.js';
import { BudgetAddForm } from './budget-body.js';
import { CollectionAddForm, collectionHasInputs } from './collection-body.js';
import { ConsumptionAddForm, consumptionHasMeters } from './consumption-body.js';
import { RssAddForm } from './more-bodies.js';
import { Err } from './parts.js';
import { ReadLaterAddForm } from './read-later-body.js';
import { StockAddForm } from './stocks-body.js';
import { TemplateAddForm } from './templates-body.js';
import { TileSheet } from './tile-sheet.js';
import { ZoneAddForm } from './timezones-body.js';
import { TodoAddForm } from './todos-body.js';
import { TripAddForm } from './travel-body.js';

/** How one tile kind adds an entry: the ＋ button's label, the sheet's title and its form. */
export interface AddEntry {
  /** Accessibility label of the ＋ button, e.g. "Add event". */
  label: string;
  /** Heading of the add sheet, e.g. "New event". */
  title: string;
  Form: ComponentType<AddFormProps>;
}

type AddEntryFor = (content: string, now: Date) => AddEntry | null;

const fixed =
  (entry: AddEntry): AddEntryFor =>
  () =>
    entry;

const PromptForm = (p: AddFormProps) => <TemplateAddForm {...p} kind="prompt" />;
const CommandForm = (p: AddFormProps) => <TemplateAddForm {...p} kind="command" />;

/**
 * Every tile kind that adds entries, in one place. A kind missing here has no ＋ (habit and
 * timer act with one tap, board and palette settings are edited elsewhere).
 */
export const ADD_ENTRIES: { readonly [K in TileKind]?: AddEntryFor } = {
  todos: fixed({ label: 'New todo', title: 'New todo', Form: TodoAddForm }),
  events: fixed({ label: 'Add event', title: 'New event', Form: EventAddForm }),
  actionlog: fixed({ label: 'Add log entry', title: 'Log an action', Form: ActionLogAddForm }),
  timezones: fixed({ label: 'Add time zone', title: 'Add a time zone', Form: ZoneAddForm }),
  readitlater: fixed({ label: 'Add page', title: 'Save a page', Form: ReadLaterAddForm }),
  bookmarks: fixed({ label: 'Add bookmark', title: 'New bookmark', Form: BookmarkAddForm }),
  budget: fixed({ label: 'Add transaction', title: 'New transaction', Form: BudgetAddForm }),
  stocks: fixed({ label: 'Add value', title: 'New value', Form: StockAddForm }),
  consumption: (content) =>
    consumptionHasMeters(content)
      ? { label: 'Add reading', title: 'New reading', Form: ConsumptionAddForm }
      : { label: 'Add meter', title: 'New meter', Form: ConsumptionAddForm },
  // A collection without typed columns has nothing to enter.
  datacollection: (content, now) =>
    collectionHasInputs(content, now)
      ? { label: 'Add entry', title: 'New entry', Form: CollectionAddForm }
      : null,
  prompts: fixed({ label: 'Add prompt', title: 'New prompt', Form: PromptForm }),
  commands: fixed({ label: 'Add command', title: 'New command', Form: CommandForm }),
  rss: fixed({ label: 'Add feed', title: 'New feed', Form: RssAddForm }),
  travel: fixed({ label: 'Add trip', title: 'New trip', Form: TripAddForm }),
};

export const addEntryFor = (kind: TileKind, content: string, now: Date): AddEntry | null =>
  ADD_ENTRIES[kind]?.(content, now) ?? null;

/** The ＋ sheet: the kind's form in a keyboard-safe bottom sheet, with the write's error. */
export function AddEntrySheet({
  entry,
  ctx,
  onClose,
}: {
  entry: AddEntry;
  ctx: Ctx;
  onClose: () => void;
}) {
  const { Form } = entry;
  return (
    <TileSheet title={entry.title} onClose={onClose} testID="add-entry-sheet">
      <Form ctx={ctx} onDone={onClose} />
      <Err error={ctx.error} />
    </TileSheet>
  );
}
