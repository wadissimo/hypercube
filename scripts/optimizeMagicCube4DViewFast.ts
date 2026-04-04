import { execSync } from 'node:child_process';

// Small wrapper to run the full optimizer with a reduced grid when quick turnaround matters.
// This keeps the objective identical while shrinking the search space.
execSync(
  'npx --yes tsx scripts/optimizeMagicCube4DView.ts --fast',
  { stdio: 'inherit' },
);
