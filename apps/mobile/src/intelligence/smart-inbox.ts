import type { CaptureResult, QuickCaptureController } from '../screens/quick-capture.js';
import { appIntelligence } from './app-model.js';
import type { LanguageModel } from './model.js';
import { type CaptureFiles, githubCaptureFiles, habitNames, saveCapture } from './save-capture.js';
import { describeCapture, parseCapture } from './smart-capture.js';

/**
 * The inbox sheet: Foundation Models turns the text into a typed capture where it can, else it is
 * saved exactly as before (a plain inbox todo).
 */
export async function smartInbox(
  text: string,
  deps: {
    controller: QuickCaptureController;
    files?: CaptureFiles;
    model?: LanguageModel | null;
    now?: Date;
  },
): Promise<CaptureResult> {
  const files = deps.files ?? githubCaptureFiles;
  const model = deps.model === undefined ? appIntelligence().model : deps.model;
  const { capture, source } = await parseCapture(text, {
    model,
    now: deps.now ?? new Date(),
    context: { habits: habitNames(files) },
  });
  if (source === 'plain') return deps.controller.quickTodo(text);
  const res = await saveCapture(capture, { controller: deps.controller, files });
  return res.ok ? { ...res, message: `${res.message} (${describeCapture(capture)})` } : res;
}
