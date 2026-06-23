import {
  Badge as BadgeImport,
  Button as ButtonImport,
  CardContent as CardContentImport,
  Card as CardImport,
  Input as InputImport,
} from '@cascivo/react';
import type { h } from 'preact';

// Cascivo ships React prop types; cast to Preact-typed signatures so JSX with
// Preact element children type-checks (same bridge pattern as the wrappers).
type AnyComp = (props: Record<string, unknown>) => h.JSX.Element;
const Button = ButtonImport as unknown as AnyComp;
const Input = InputImport as unknown as AnyComp;
const Badge = BadgeImport as unknown as AnyComp;
const Card = CardImport as unknown as AnyComp;
const CardContent = CardContentImport as unknown as AnyComp;

// Phase 2 visual check: renders raw Cascivo components under the LifeOS theme
// bridge (.life-os-root[data-theme="dark"] + cascivo.css brand overrides) so the
// neon accent / mono font / --los-* palette can be verified before migrating the
// real @lifosy/ui primitives in Phase 3.
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
        <Button variant="destructive">Destructive</Button>
      </div>

      <Input placeholder="An input field" />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Badge>Badge</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>

      <Card>
        <CardContent>
          A Cascivo Card, themed by the LifeOS palette via the token bridge.
        </CardContent>
      </Card>
    </div>
  </div>
);
