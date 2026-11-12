import { QuickCaptureScreen } from '../src/views/quick-capture-screen.js';

/**
 * `kaihuman://quick-inbox`: the widget "+", the quick-add widget and the inbox control. Same
 * "New todo" sheet as the in-app ＋ (`/quick-todo`); the todo lands in the inbox either way.
 */
export default function QuickInbox() {
  return <QuickCaptureScreen kind="todo" />;
}
