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
// The workspace is stubbed here rather than mocked in detail: this file is about
// what the page says and what it places on the page, and the workspace and the
// editor wrapper each have their own file.
vi.mock('@/editor/local-editor-workspace', () => ({
  LocalEditorWorkspace: () => <div data-testid="local-editor-workspace" />,
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

    // Matched by shape rather than by the exact milestone, so that advancing
    // within a phase does not require editing a test that is not about the
    // milestone number.
    expect(screen.getByText(/Phase B\d/)).toBeInTheDocument();
  });

  it('gives the workspace a place on the page', () => {
    render(<Home />);

    expect(screen.getByTestId('local-editor-workspace')).toBeInTheDocument();
  });

  it('says that the file is temporary and that a refresh discards the changes', () => {
    render(<Home />);

    expect(screen.getByText(/one temporary file/i)).toBeInTheDocument();
    expect(screen.getByText(/refreshing the page discards your changes/i)).toBeInTheDocument();
  });

  it('says that a refresh also returns the file to TypeScript', () => {
    render(<Home />);

    expect(screen.getByText(/starts again from TypeScript/i)).toBeInTheDocument();
  });

  it('says that choosing a language re-reads the one file rather than opening another', () => {
    render(<Home />);

    expect(screen.getByText(/does not open a different file/i)).toBeInTheDocument();
  });

  it('does not claim that collaboration, persistence, or execution work yet', () => {
    render(<Home />);

    expect(
      screen.getByText(/collaboration, persistence, and code execution are not implemented yet/i),
    ).toBeInTheDocument();
  });
});
