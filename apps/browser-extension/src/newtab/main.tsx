import { render } from 'preact';
import '../index.css';
import { StartPage } from './StartPage.tsx';

render(<StartPage />, document.getElementById('app') as HTMLElement);
