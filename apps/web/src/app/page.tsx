export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-24 font-sans">
      <h1 className="text-4xl font-semibold tracking-tight">DevSync</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        A browser-based collaborative development environment.
      </p>
      <p className="text-sm text-zinc-500">
        Phase A5 — architecture documentation, closing the Phase A foundation: a pnpm and Turborepo
        monorepo, centralised configuration, three testing layers, production container images, and
        continuous integration.
      </p>
      <p className="text-sm text-zinc-500">
        No product functionality exists — this page and a health endpoint are the whole application.
        Real-time collaboration, the collaborative editor, project persistence, and code execution
        are not implemented yet.
      </p>
    </main>
  );
}
