import { ProjectWorkspace } from '@/workspace/project-workspace';

/**
 * A thin server shell. It reads the identifier out of the route and hands it to
 * the client component that does the work — nothing is fetched here, because
 * project data is per-request state that must not be prerendered, cached, or
 * served from a build.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  // Keyed by the identifier, so moving from one project to another replaces the
  // workspace rather than reusing it with a new prop. That is what makes "loading"
  // the state a project always starts in, instead of a previous project's files
  // being on screen while the next one is fetched.
  return <ProjectWorkspace key={projectId} projectId={projectId} />;
}
