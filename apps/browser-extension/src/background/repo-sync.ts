/**
 * Keeps the extension on the same repository as the desktop palette, through Chrome native
 * messaging (`kaihuman-palette native-host install <extension id>`; the host is
 * apps/desktop-palette/src-tauri/src/native_host.rs).
 *
 * Each side records when its repository last changed, and the newer choice wins. Without the host
 * installed, `sendNativeMessage` fails and the extension keeps its own choice, as before.
 */

export const NATIVE_HOST = 'com.kaihuman.palette';
/** When `lifeos_repo` last changed here, or the desktop's time for a choice taken from it. */
export const REPO_CHANGED_AT = 'lifeos_repo_changed_at';

interface RepoChoice {
  repo: string;
  changedAt: number;
}

/** `owner/name`, as the desktop's `is_repo_name`: no part empty, `.` or `..`. */
const isRepoName = (repo: string) => {
  const parts = repo.split('/');
  return (
    parts.length === 2 &&
    parts.every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')
  );
};

const isRepoChoice = (value: unknown): value is RepoChoice => {
  const choice = value as Partial<RepoChoice> | null;
  return (
    typeof choice?.repo === 'string' &&
    isRepoName(choice.repo) &&
    typeof choice.changedAt === 'number'
  );
};

/** Asks the desktop which repository wins, takes it if it is not ours, and says whether it did. */
export async function syncRepoWithDesktop(): Promise<boolean> {
  const data = await chrome.storage.local.get(['lifeos_repo', REPO_CHANGED_AT]);
  const mine: RepoChoice = {
    // Empty when none is picked yet: the desktop then answers with its own, if it has one.
    repo: (data.lifeos_repo as string | undefined) ?? '',
    changedAt: (data[REPO_CHANGED_AT] as number | undefined) ?? 0,
  };
  let answer: unknown;
  try {
    answer = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: 'SYNC_REPO', ...mine });
  } catch (error) {
    // No host installed, or a sandboxed browser that cannot start it.
    console.debug('LifeOS Extension: no desktop palette to share the repository with', error);
    return false;
  }
  // An empty repository means the desktop has none either.
  if ((answer as Partial<RepoChoice> | null)?.repo === '') return false;
  if (!isRepoChoice(answer)) {
    console.warn('LifeOS Extension: the desktop palette answered', answer);
    return false;
  }
  if (answer.repo === mine.repo) return false;
  // Stored together, so the change listener below knows this one came from the desktop.
  await chrome.storage.local.set({ lifeos_repo: answer.repo, [REPO_CHANGED_AT]: answer.changedAt });
  return true;
}

/**
 * The popup, the palette and the console's token handoff all write `lifeos_repo` to storage, so
 * this one listener stamps each change and tells the desktop at once. A change the sync above made
 * carries its own stamp and is left alone.
 */
export function watchRepoChanges(now: () => number = Date.now): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes.lifeos_repo;
    if (area !== 'local' || !change || changes[REPO_CHANGED_AT]) return;
    if (!change.newValue || change.newValue === change.oldValue) return;
    chrome.storage.local
      .set({ [REPO_CHANGED_AT]: now() })
      .then(syncRepoWithDesktop)
      .catch((error) => console.warn('LifeOS Extension: could not share the repository', error));
  });
}
