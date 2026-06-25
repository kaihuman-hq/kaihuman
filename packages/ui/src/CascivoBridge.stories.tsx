import { Button } from './components/Button';
import { Input } from './components/Input';

// Phase 2 visual check: renders the Cascivo-backed Button/Input under the LifeOS
// theme bridge (.life-os-root[data-theme="dark"] + cascivo.css + the vendored
// cascivo-components.css) so the neon accent / mono font / --los-* palette can be
// verified.
const meta = {
  title: 'Cascivo/Theme Bridge',
};
export default meta;

export const Primitives = () => (
  <div data-theme="dark" class="life-os-root" style={{ padding: '2rem', minHeight: '100vh' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '420px' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>

      <Input placeholder="An input field" />
    </div>
  </div>
);
