import { useLocalSearchParams } from 'expo-router';
import { QuickCaptureScreen } from '../src/views/quick-capture-screen.js';

export default function QuickNote() {
  const { text } = useLocalSearchParams<{ text?: string | string[] }>();
  return <QuickCaptureScreen kind="note" text={Array.isArray(text) ? text[0] : text} />;
}
