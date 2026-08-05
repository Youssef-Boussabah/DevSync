import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';

// The home page is a Server Component, but a synchronous one that touches no
// server-only API: it is an ordinary function returning JSX, so React Testing
// Library can render it directly and no test-only wrapper had to be invented for
// it. `layout.tsx` is a different matter — it imports `next/font/google`, which
// only the Next.js compiler resolves — so the metadata it declares is asserted by
// the Playwright suite against the real document instead.
//
// The project list is stubbed here rather than mocked in detail: this file is
// about what the page says and what it places on the page, and the list has its
// own file.
vi.mock('@/projects/project-list-view', () => ({
  ProjectListView: () => <div data-testid="project-list-view" />,
}));

describe('home page', () => {
  it('identifies the product as DevSync', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'DevSync' })).toBeInTheDocument();
  });

  it('describes what DevSync is', () => {
    render(<Home />);

    expect(
      screen.getByText('A browser-based collaborative development environment.'),
    ).toBeInTheDocument();
  });

  it('states which phase the repository is at', () => {
    render(<Home />);

    // Matched by phase rather than by milestone. The page names the phase it is
    // at, not the milestone within it, so that finishing a milestone does not
    // require editing user-facing copy that was never about the number.
    expect(screen.getByText(/Phase C\b/)).toBeInTheDocument();
  });

  it('gives the project list a place on the page', () => {
    render(<Home />);

    expect(screen.getByTestId('project-list-view')).toBeInTheDocument();
  });

  it('says that saved work survives a reload, which is what C3 made true', () => {
    render(<Home />);

    expect(screen.getByText(/still there after a reload/i)).toBeInTheDocument();
  });

  it('says that nothing is saved until Save, and that there is no autosave', () => {
    render(<Home />);

    expect(screen.getByText(/there is no autosave/i)).toBeInTheDocument();
    expect(screen.getByText(/saved when you press Save/i)).toBeInTheDocument();
  });

  it('does not claim collaboration, presence, or accounts exist', () => {
    render(<Home />);

    expect(
      screen.getByText(/no collaboration, no presence, and no version history/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('no longer claims a refresh discards what was typed', () => {
    render(<Home />);

    expect(screen.queryByText(/discards your changes/i)).not.toBeInTheDocument();
  });
});
