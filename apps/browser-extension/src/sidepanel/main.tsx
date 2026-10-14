import { render } from 'preact';
import './sidepanel.css';
import { SidePanel } from './SidePanel.tsx';

render(<SidePanel />, document.getElementById('app') as HTMLElement);
