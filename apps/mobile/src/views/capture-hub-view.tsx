import type { QuickKind } from '../navigation/routes.js';
import { useTheme } from '../theme/theme.js';
import type { IconName } from '../ui/index.js';
import { haptics, ListRow, Screen, Section } from '../ui/index.js';

interface CaptureOption {
  kind: QuickKind;
  title: string;
  subtitle: string;
  icon: IconName;
  /** iOS tile fill; undefined falls back to the brand fill. */
  tile?: string;
  glyph?: string;
}

const OPTIONS: readonly CaptureOption[] = [
  { kind: 'todo', title: 'Todo', subtitle: 'Add to your todo list', icon: 'todo' },
  { kind: 'note', title: 'Note', subtitle: 'Jot something down', icon: 'note', tile: '#FF9F0A' },
  {
    kind: 'log',
    title: 'Log',
    subtitle: 'Timestamped journal entry',
    icon: 'log',
    tile: '#5E5CE6',
  },
  {
    kind: 'idea',
    title: 'Idea',
    subtitle: 'Park an idea for later',
    icon: 'ideas',
    tile: '#FFD60A',
    glyph: '#1C1C1E',
  },
  {
    kind: 'knowledge',
    title: 'Knowledge',
    subtitle: 'Save a fact or link',
    icon: 'knowledge',
    tile: '#30B0C7',
  },
];

export function CaptureHubView({ onSelect }: { onSelect: (kind: QuickKind) => void }) {
  const { colors, platform } = useTheme();
  // Android ignores the tile and keeps a neutral glyph, so a custom glyph colour would vanish there.
  const ios = platform === 'ios';
  return (
    <Screen title="Capture">
      <Section header="New">
        {OPTIONS.map((o) => (
          <ListRow
            key={o.kind}
            testID={`capture-${o.kind}`}
            title={o.title}
            subtitle={o.subtitle}
            icon={o.icon}
            iconBackground={o.tile ?? colors.accentFill}
            iconColor={ios ? (o.glyph ?? (o.tile ? '#FFFFFF' : colors.onAccentFill)) : undefined}
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
