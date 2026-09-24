import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { CommandsWidget } from './CommandsWidget';

const meta = {
  title: 'LifeOS/Organisms/Widgets/CommandsWidget',
  parameters: {
    backgrounds: { default: 'dark' },
  },
} satisfies Meta;

export default meta;

const SAMPLE = `# Commands

## List a folder #files
With hidden files.
\`\`\`sh
ls -la {{folder}}
\`\`\`

## Wi-Fi on #network
nmcli radio wifi on

## Connect to a network #network
\`\`\`sh
nmcli connection up {{network}}
\`\`\`

## Top words in a column #text
\`\`\`sh
awk '{print $1}' {{file}} | sort | uniq -c | sort -rn | head -{{count}}
\`\`\`
`;

const Stateful = ({ mode }: { mode: 'SMALL' | 'FOCUS' | 'ADD' }) => {
  const [content, setContent] = useState(SAMPLE);
  return (
    <div style={{ width: mode === 'SMALL' ? 360 : 720, height: mode === 'SMALL' ? 320 : 'auto' }}>
      <CommandsWidget content={content} mode={mode} onChange={setContent} />
    </div>
  );
};

export const Focus: StoryObj = { render: () => <Stateful mode="FOCUS" /> };
export const Small: StoryObj = { render: () => <Stateful mode="SMALL" /> };
export const Add: StoryObj = { render: () => <Stateful mode="ADD" /> };
