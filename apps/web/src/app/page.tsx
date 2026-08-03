import { CodeEditor } from '@/editor/code-editor';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 font-sans">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">DevSync</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A browser-based collaborative development environment.
        </p>
        <p className="text-sm text-zinc-500">
          Phase B0 — Monaco integration. The editor below is the first product functionality in the
          repository; everything else about DevSync is still a plan.
        </p>
      </header>

      <CodeEditor />

      <p className="text-sm text-zinc-500">
        This is one temporary editor, held in this browser tab and nowhere else. Refreshing the page
        discards whatever you type. There are no files, no projects, no accounts, and no server
        involvement — the editor talks to nothing, and collaboration, persistence, and code
        execution are not implemented yet.
      </p>
    </main>
  );
}
