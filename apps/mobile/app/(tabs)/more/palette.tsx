import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { loadPaletteSettings } from '../../../src/screens/settings.js';
import { PaletteSettingsScreen } from '../../../src/views/palette-settings-screen.js';

const load = () => loadPaletteSettings(githubContentFiles);
const write = (path: string, content: string) => githubContentFiles.write(path, content);

export default function PaletteSettings() {
  return <PaletteSettingsScreen load={load} onWrite={write} />;
}
