import { LocalEditorWorkspace } from '@/editor/local-editor-workspace';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 font-sans">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">DevSync</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A browser-based collaborative development environment.
        </p>
        <p className="text-sm text-zinc-500">
          Phase B1 — the local editing workspace. One file, open in one editor, with its contents
          held by the application in this tab. Everything else about DevSync is still a plan.
        </p>
      </header>

      <LocalEditorWorkspace />

      <p className="text-sm text-zinc-500">
        One temporary file, held in this browser tab&rsquo;s memory and nowhere else. Refreshing the
        page discards your changes, because there is nowhere yet to save them to: no projects, no
        accounts, and no database. Collaboration, persistence, and code execution are not
        implemented yet.
      </p>
    </main>
  );
}
