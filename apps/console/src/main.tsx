import { render } from 'preact';
import { App } from './App';
import '@lifosy/ui/styles.css';
import './index.css';

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed to exist
render(<App />, document.getElementById('app')!);
