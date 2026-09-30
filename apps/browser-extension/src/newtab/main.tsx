import { render } from 'preact';
import './newtab.css';
import { StartPage } from './StartPage.tsx';

render(<StartPage />, document.getElementById('app') as HTMLElement);
