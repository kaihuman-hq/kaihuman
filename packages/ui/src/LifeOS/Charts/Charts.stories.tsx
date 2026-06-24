import { DonutChart } from './DonutChart';
import { StackedBarChart } from './StackedBarChart';

// Visual check for the Cascivo-backed chart wrappers under the LifeOS theme:
// semantic per-slice / per-series colors, donut center value/label, and the
// app's grid/axis colors. Eyeball that colors are meaningful (not palette-
// rotated) and the donut hole shows the total.
const meta = {
  title: 'Cascivo/Charts',
};
export default meta;

const STATUS = {
  backlog: '#64748b',
  inProgress: '#38bdf8',
  done: '#22c55e',
  rejected: '#ef4444',
};

export const Donut = () => (
  <div data-theme="dark" class="life-os-root" style={{ padding: '2rem' }}>
    <DonutChart
      segments={[
        { label: 'Backlog', value: 12, color: STATUS.backlog },
        { label: 'In progress', value: 5, color: STATUS.inProgress },
        { label: 'Done', value: 22, color: STATUS.done },
        { label: 'Rejected', value: 3, color: STATUS.rejected },
      ]}
      size={140}
      thickness={28}
      centerValue="42"
      centerLabel="tasks"
    />
  </div>
);

export const StackedBars = () => (
  <div data-theme="dark" class="life-os-root" style={{ padding: '2rem' }}>
    <div style={{ width: '480px', height: '220px' }}>
      <StackedBarChart
        width={480}
        height={220}
        colors={{ border: '#333333', muted: '#64748b', bg: '#0a0a0f' }}
        data={['W1', 'W2', 'W3', 'W4'].map((label, i) => ({
          label,
          segments: [
            { label: 'Done', value: 3 + i, color: STATUS.done },
            { label: 'In progress', value: 2, color: STATUS.inProgress },
            { label: 'Backlog', value: 4 - i, color: STATUS.backlog },
          ],
        }))}
      />
    </div>
  </div>
);
