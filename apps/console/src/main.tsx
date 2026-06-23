import { render } from 'preact';
import { App } from './App';
// Cascivo CSS, in required order: components → tokens+theme → brand overrides.
// Component + theme CSS come from node_modules; the brand-override layer
// (imported by ./index.css from @lifosy/ui/cascivo.css) must load last.
import '@cascivo/react/styles.css';
import '@cascivo/themes/dark.css';
import './index.css';

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed to exist
render(<App />, document.getElementById('app')!);
