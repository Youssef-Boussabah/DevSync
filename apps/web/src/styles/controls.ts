/**
 * The class lists the form controls share.
 *
 * Constants rather than wrapper components: the markup stays ordinary `<input>`,
 * `<select>`, and `<button>` elements — with their platform behaviour, their
 * keyboard handling, and their accessible names intact — while the seven places
 * that render one stop carrying the same forty characters of Tailwind.
 *
 * Every interactive control carries a visible focus ring and a disabled style,
 * because both are states a user has to be able to see.
 */

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500';

const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50';

export const FIELD_CLASS =
  `w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 ` +
  `dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${FOCUS} ${DISABLED}`;

export const LABEL_CLASS = 'text-sm font-medium text-zinc-600 dark:text-zinc-400';

const BUTTON_BASE =
  `inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ` +
  `${FOCUS} ${DISABLED}`;

export const PRIMARY_BUTTON_CLASS =
  `${BUTTON_BASE} bg-zinc-900 text-white hover:bg-zinc-700 ` +
  `dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`;

export const SECONDARY_BUTTON_CLASS =
  `${BUTTON_BASE} border border-zinc-300 text-zinc-800 hover:bg-zinc-100 ` +
  `dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;

export const DANGER_BUTTON_CLASS =
  `${BUTTON_BASE} border border-red-300 text-red-700 hover:bg-red-50 ` +
  `dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950`;

export const ERROR_TEXT_CLASS = 'text-sm text-red-700 dark:text-red-400';

export const MUTED_TEXT_CLASS = 'text-sm text-zinc-500';
