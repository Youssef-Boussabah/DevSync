// Runs once per test file, before the tests in it.
//
// Both entries exist because `globals` is off in `vitest.config.ts`: without a
// global `afterEach`, React Testing Library cannot register its own automatic
// cleanup, so it is registered here explicitly. Nothing else belongs in this
// file — a setup file that grows into shared fixtures is a shared fixture module
// wearing a disguise.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
