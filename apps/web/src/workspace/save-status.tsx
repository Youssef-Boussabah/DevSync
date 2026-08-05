export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

const LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  failed: 'Save failed',
};

const TONES: Record<SaveState, string> = {
  saved: 'text-zinc-500',
  unsaved: 'text-amber-700 dark:text-amber-400',
  saving: 'text-zinc-500',
  failed: 'text-red-700 dark:text-red-400',
};

/**
 * Whether the file on screen is the file on the server.
 *
 * A live region, because the state changes in response to a request rather than
 * to the click that started it: a user who has moved on to the editor should be
 * told that the save landed without having to look back at the toolbar.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p role="status" aria-live="polite" className={`text-sm font-medium ${TONES[state]}`}>
      {LABELS[state]}
    </p>
  );
}
