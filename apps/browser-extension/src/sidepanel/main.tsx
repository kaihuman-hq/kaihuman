import { render } from 'preact';
import '../index.css';
import { SidePanel } from './SidePanel.tsx';

render(<SidePanel />, document.getElementById('app') as HTMLElement);
