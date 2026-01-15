import type { Meta, StoryObj } from '@storybook/preact';
import { Panel } from './Panel';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from './Sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './SplitView';
import { Button } from './Button';

const meta = {
  title: 'Nexus/Layouts',
} satisfies Meta;

export default meta;

export const Panels: StoryObj = {
  render: () => (
    <div className="flex gap-4 p-4 h-64">
      <Panel variant="default" className="flex-1">Default Panel</Panel>
      <Panel variant="glass" className="flex-1">Glass Panel</Panel>
      <Panel variant="bordered" className="flex-1">Bordered Panel</Panel>
    </div>
  ),
};

export const SidebarLayout: StoryObj = {
  render: () => (
    <div className="flex h-[500px] border border-nexus-border rounded-lg overflow-hidden">
      <Sidebar>
        <SidebarHeader><span className="font-bold text-nexus-primary">Console</span></SidebarHeader>
        <SidebarContent>
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start" label="Dashboard" />
            <Button variant="ghost" className="w-full justify-start" label="Editor" />
            <Button variant="ghost" className="w-full justify-start" label="Settings" />
          </div>
        </SidebarContent>
        <SidebarFooter>Footer Info</SidebarFooter>
      </Sidebar>
      <div className="flex-1 bg-nexus-bg p-4 text-nexus-text">
        Main Content Area
      </div>
    </div>
  ),
};

export const SplitViewLayout: StoryObj = {
  render: () => (
    <div className="h-[500px] border border-nexus-border rounded-lg overflow-hidden text-nexus-text">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15}>
          <div className="flex h-full items-center justify-center p-6 text-nexus-muted">
            Sidebar
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={70}>
              <div className="flex h-full items-center justify-center p-6 text-nexus-muted">
                Editor
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30}>
              <div className="flex h-full items-center justify-center p-6 text-nexus-muted">
                Terminal
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
