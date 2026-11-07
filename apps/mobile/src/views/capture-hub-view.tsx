import type { QuickKind } from '../navigation/routes.js';
import type { IconName, IconTone } from '../ui/index.js';
import { haptics, ListRow, Screen, Section } from '../ui/index.js';

interface CaptureOption {
  kind: QuickKind;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: IconTone;
}

const OPTIONS: readonly CaptureOption[] = [
  {
    kind: 'todo',
    title: 'Todo',
    subtitle: 'Add to your todo list',
    icon: 'todo',
    tone: 'accent',
  },
  { kind: 'note', title: 'Note', subtitle: 'Jot something down', icon: 'note', tone: 'neutral' },
  { kind: 'log', title: 'Log', subtitle: 'Timestamped journal entry', icon: 'log', tone: 'info' },
  {
    kind: 'idea',
    title: 'Idea',
    subtitle: 'Park an idea for later',
    icon: 'ideas',
    tone: 'warning',
  },
  {
    kind: 'knowledge',
    title: 'Knowledge',
    subtitle: 'Save a fact or link',
    icon: 'knowledge',
    tone: 'success',
  },
];

export function CaptureHubView({ onSelect }: { onSelect: (kind: QuickKind) => void }) {
  return (
    <Screen title="Capture">
      <Section footer="Everything you capture is saved to your repository.">
        {OPTIONS.map((o) => (
          <ListRow
            key={o.kind}
            testID={`capture-${o.kind}`}
            title={o.title}
            subtitle={o.subtitle}
            icon={o.icon}
            iconTone={o.tone}
            accessory="chevron"
            onPress={() => {
              haptics.selection();
              onSelect(o.kind);
            }}
          />
        ))}
      </Section>
    </Screen>
  );
}
