import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { MainApp, TileDef } from './MainApp';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { DashboardConfig } from '../types';

const meta = {
  title: 'LifeOS/Layouts',
  parameters: {
    backgrounds: { default: 'dark' },
    layout: 'fullscreen'
  }
} satisfies Meta;

export default meta;

export const TileMatrix: StoryObj = {
  render: () => {
    const [currentRepo, setCurrentRepo] = useState(mockRepos[0]);

    // Generate a larger mock file system for the Matrix
    const matrixItems: any[] = Array.from({ length: 48 }, (_, i) => {
      const isFolder = i % 5 === 0;
      return {
        id: `item_${i}`,
        title: isFolder ? `Folder ${i}` : `File ${i}`,
        type: isFolder ? 'FOLDER' : 'FILE',
        content: <div className="p-8"><MonoText>Content for {i}</MonoText></div>,
        children: isFolder ? Array.from({ length: 10 }, (_, j) => ({
          id: `child_${i}_${j}`,
          title: `Child File ${i}-${j}`,
          type: 'FILE',
          content: <div className="p-8"><MonoText>Child Content {i}-{j}</MonoText></div>
        })) : undefined
      };
    });

    interface StoryColumn {
      items: any[];
      activeId: string | null;
    }

    const [columns, setColumns] = useState<StoryColumn[]>([
      { items: matrixItems, activeId: null }
    ]);

    const handleNavigate = (item: any) => {
      if (item.type === 'FOLDER') {
        const colIndex = columns.findIndex((col: any) => col.items.some((i: any) => i.id === item.id));
        const newColumns = [...columns].slice(0, colIndex + 1);
        newColumns[colIndex] = { ...newColumns[colIndex], activeId: item.id } as any;

        const children: any[] = item.children || [];
        newColumns.push({ items: children, activeId: null });

        setColumns(newColumns);
      } else {
        const colIndex = columns.findIndex((col: any) => col.items.some((i: any) => i.id === item.id));
        const newColumns = [...columns].slice(0, colIndex + 1);
        newColumns[colIndex] = { ...newColumns[colIndex], activeId: item.id } as any;
        setColumns(newColumns);
      }
    };

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={handleNavigate}
      onNavigate={(path) => {
        if (path.length === 0) {
          setColumns([{ items: matrixItems, activeId: null }]);
          setCurrentRepo(mockRepos[0]); // Optional: reset repo too if needed
        }
      }}
      currentRepository={currentRepo}
      repositories={mockRepos}
      onSelectRepository={(repo: any) => setCurrentRepo(repo)}
    />;
  }
};



// ... (existing code)

export const TimeTracking: StoryObj = {
  render: () => {
    const [csvContent, setCsvContent] = useState(`iso date;time
2023-10-27;08:00,12:00,13:00,17:00
${new Date().toISOString().split('T')[0]};09:00,11:30`);

    const timeTrackingTile = {
      id: 'tt_1',
      title: 'Work Hours.timetracking.csv',
      type: 'FILE',
      extension: '.timetracking.csv',
      rawContent: csvContent,
      onContentChange: (newVal: string) => {
        setCsvContent(newVal);
        console.log('CSV Updated:', newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [timeTrackingTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav logic
        if (item.type === 'FOLDER') {
          // ... folder logic ...
        }
      }}
    />;
  }
};

const mockRepos = [
  { id: '1', name: 'Lifosy/monorepo', branch: 'main' },
  { id: '2', name: 'Lifosy/ui', branch: 'develop' },
  { id: '3', name: 'Lifosy/core', branch: 'feature/repo-selection' },
];

export const ConfiguredDashboard: StoryObj = {
  render: () => {
    // Sample Config from user
    const sampleConfig: DashboardConfig = {
      "version": 1,
      "dashboards": [
        {
          "id": "d0",
          "name": "Personal"
        },
        {
          "id": "d1",
          "name": "Work Proj A"
        },
        {
          "id": "d2",
          "name": "Learning"
        },
        {
          "id": "d3",
          "name": "Finance"
        },
        {
          "id": "d4",
          "name": "Health & Fitness"
        },
        {
          "id": "d5",
          "name": "Archive 2023"
        }
      ],
      "entries": [
        {
          "path": "test2.habit.csv",
          "dashboard": "d0",
          "skipOnMobile": false
        },
        {
          "path": "my2.achievements.md",
          "dashboard": "d1",
          "skipOnMobile": false
        },
        {
          "path": "generic-test/generic-other.csv.md",
          "dashboard": "d3",
          "skipOnMobile": false
        },
        {
          "path": "test-todos.todos.md",
          "dashboard": "d2",
          "skipOnMobile": false
        },
        {
          "path": "reditlater.readitlater.json",
          "dashboard": "d2",
          "skipOnMobile": false
        },
        {
          "path": ".lifeos/.readitlater.json",
          "dashboard": "d0",
          "skipOnMobile": false
        },
        {
          "path": "my-date-time.timezones.json",
          "dashboard": "d0",
          "skipOnMobile": false
        }
      ],
      "files": {
        "selected": "0_event.events.csv",
        "opened": [
          "0_event.events.csv"
        ],
        "recentlyOpened": [
          "0_event.events.csv",
          "my-lifosy-event.lifosy-event.json",
          "testidea .tldraw.json",
          ".lifeos/.readitlater.json"
        ]
      }
    };

    // Mock file contents
    const mockFileContents: Record<string, string> = {
      "test2.habit.csv": "date,habit1\n2023-10-01,true",
      "my2.achievements.md": "# Achievements\n- Built a dashboard",
      ".lifeos/.readitlater.json": "[]",
      "my-date-time.timezones.json": "{}",
      // ... others empty
    };

    const [config, setConfig] = useState<DashboardConfig>(sampleConfig);

    return (
      <MainApp
        config={config}
        onConfigChange={setConfig}
        fileContents={mockFileContents}
      />
    );
  }
};
