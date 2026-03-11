import type { GroupProps, SeparatorProps } from 'react-resizable-panels';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../utils';

export const ResizablePanelGroup = ({ className, ...props }: GroupProps) => (
  <Group
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
);

export const ResizablePanel = Panel;

export const ResizableHandle = ({
  className,
  withHandle,
  ...props
}: SeparatorProps & { withHandle?: boolean }) => (
  <Separator
    className={cn(
      'relative flex w-px items-center justify-center bg-nexus-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-nexus-primary focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
      className,
    )}
    {...props}
  >
    {withHandle &&
      ((
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-nexus-border bg-nexus-border">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-2.5 w-2.5"
          >
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
          </svg>
        </div>
      ) as any)}
  </Separator>
);
