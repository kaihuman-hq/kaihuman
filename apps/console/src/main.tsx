import { render } from 'preact';
import { App } from './App';
// Before anything can save a file: sync merges need the list-format mergers registered.
import './lib/register-mergers';
// index.css declares the cascade layer order (Tailwind first, Cascivo after) and
// must load BEFORE any Cascivo CSS so that order takes effect — otherwise
// Cascivo's @layer cascivo.component appears first and Tailwind's Preflight
// (@layer base) overrides the editor's padding/layout.
import './index.css';
import '@cascivo/editor/styles.css';
import '@cascivo/charts/styles.css';
import '@cascivo/themes/dark.css';

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed to exist
render(<App />, document.getElementById('app')!);
