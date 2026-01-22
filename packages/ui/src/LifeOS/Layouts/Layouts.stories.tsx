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



export const HabitTracking: StoryObj = {
  render: () => {
    // Generate some random habit data for the last 6 months
    const generateHabitData = () => {
      const today = new Date();
      let csv = 'iso date;goal reached\n';
      for (let i = 0; i < 180; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (Math.random() > 0.5) {
          csv += `${d.toISOString().split('T')[0]};x\n`;
        }
      }
      return csv;
    };

    const [csvContent, setCsvContent] = useState(generateHabitData());

    const habitTile = {
      id: 'habit_1',
      title: 'Workout.habit.csv',
      type: 'FILE',
      extension: '.habit.csv',
      rawContent: csvContent,
      onContentChange: (newVal: string) => {
        setCsvContent(newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [habitTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav logic
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
      "test2.habit.csv": "iso date;goal reached\n2023-10-01;x",
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

export const TodoList: StoryObj = {
  render: () => {
    const [mdContent, setMdContent] = useState(`# Work
- [ ] Finish report
- [x] Email client
::updated:: 1700000000000

# Home
- [ ] Buy milk
- [ ] Call mom`);

    const todoTile = {
      id: 'todo_1',
      title: 'Tasks.todos.md',
      type: 'FILE',
      extension: '.todos.md',
      rawContent: mdContent,
      onContentChange: (newVal: string) => {
        setMdContent(newVal);
        console.log('Todos Updated:', newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [todoTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav
      }}
    />;
  }
};

export const TimezoneClock: StoryObj = {
  render: () => {
    const [jsonContent, setJsonContent] = useState(`{
  "timezones": [
    {
      "id": "1",
      "name": "Europe/London",
      "offset": "+00:00",
      "cities": ["London"],
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    },
    {
      "id": "2",
      "name": "America/New_York",
      "offset": "-05:00",
      "cities": ["New York"],
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}`);

    const tzTile = {
      id: 'tz_1',
      title: 'World Clock.timezones.json',
      type: 'FILE',
      extension: '.timezones.json',
      rawContent: jsonContent,
      onContentChange: (newVal: string) => {
        setJsonContent(newVal);
        console.log('Timezones Updated:', newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [tzTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav
      }}
    />;
  }
};

export const RssReader: StoryObj = {
  render: () => {
    const [jsonContent, setJsonContent] = useState(`{
  "feedOptions": [
    {
      "url": "https://news.ycombinator.com/rss",
      "id": "f48475ae-a9d5-4f1e-9b37-f6399eb3424d",
      "xml": "",
      "read": []
    }
  ],
  "readLater": []
}`);

    const rssTile = {
      id: 'rss_1',
      title: 'HackerNews.rss.json',
      type: 'FILE',
      extension: '.rss.json',
      rawContent: jsonContent,
      onContentChange: (newVal: string) => {
        setJsonContent(newVal);
        console.log('RSS Updated:', newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [rssTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav
      }}
    />;
  }
};

export const ReadItLater: StoryObj = {
  render: () => {
    const [jsonContent, setJsonContent] = useState(`{
  "items": [
    {
      "id": "1",
      "url": "https://example.com/article1",
      "status": "new",
      "name": "Interesting Article 1",
      "tags": ["tech", "ai"],
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    },
    {
      "id": "2",
      "url": "https://example.com/article2",
      "status": "read",
      "name": "Read Article 2",
      "tags": ["news"],
      "createdAt": 1690000000000,
      "updatedAt": 1700000000000
    }
  ]
}`);

    const rilTile = {
      id: 'ril_1',
      title: 'ReadingList.readitlater.json',
      type: 'FILE',
      extension: '.readitlater.json',
      rawContent: jsonContent,
      onContentChange: (newVal: string) => {
        setJsonContent(newVal);
        console.log('ReadItLater Updated:', newVal);
      },
      content: <div className="p-4"><MonoText>Raw Editor Fallback</MonoText></div>
    };

    const [columns, setColumns] = useState<any[]>([
      { items: [rilTile, ...mockRepos.map((r, i) => ({ id: `r_${i}`, title: r.name, type: 'FOLDER' }))], activeId: null }
    ]);

    return <MainApp
      fileSystem={{ columns }}
      onItemClick={(item) => {
        // partial nav
      }}
    />;
  }
};
