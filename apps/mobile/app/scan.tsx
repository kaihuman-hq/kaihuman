import { useLocalSearchParams } from 'expo-router';
import { isScanKind } from '../src/intelligence/scan-kinds.js';
import { ScanView } from '../src/views/scan-view.js';

/** `kaihuman://scan[?kind=&text=]`: the document camera, or text from Visual Intelligence. */
export default function Scan() {
  const { kind, text } = useLocalSearchParams<{ kind?: string; text?: string }>();
  return (
    <ScanView
      {...(text && { initialText: text })}
      {...(isScanKind(kind) && { initialKind: kind })}
    />
  );
}
