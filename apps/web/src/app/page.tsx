import { ProjectListView } from '@/projects/project-list-view';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 font-sans">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">DevSync</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A browser-based collaborative development environment.
        </p>
        <p className="text-sm text-zinc-500">
          Phase C — projects and files stored in PostgreSQL. Create a project, edit its files, and
          press Save: what you save is still there after a reload. Everything else about DevSync is
          still a plan.
        </p>
      </header>

      <ProjectListView />

      <p className="text-sm text-zinc-500">
        Changes are saved when you press Save, and not before — there is no autosave, and nothing is
        kept in this browser. DevSync has no accounts yet, so everyone reaching this API sees the
        same projects, and there is no collaboration, no presence, and no version history: a second
        browser sees your work only after it reloads.
      </p>
    </main>
  );
}
