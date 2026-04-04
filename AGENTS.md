# Repository Guidelines

## Project Structure & Module Organization
This repository is a single Expo + React Native app. Route files live in `app/`; the current entry screen is `app/index.tsx` and shared routing setup is in `app/_layout.tsx`. Keep reusable UI in `app/components/`, interaction logic in `app/hooks/`, and pure helpers or domain logic in `app/utils/`. Static assets belong in `assets/`. Native projects are checked in under `android/` and `ios/`. `app-example/` contains the original Expo starter scaffold and is useful as reference material, not the active app.

## Build, Test, and Development Commands
Use npm with the existing lockfile.

- `npm install`: install dependencies.
- `npm run start`: start the Expo dev server.
- `npm run android`: build and launch the Android app locally.
- `npm run ios`: build and launch the iOS app locally.
- `npm run web`: run the app in a browser.
- `npm run lint`: run Expo’s ESLint configuration.

Run commands from the repository root. Prefer `npm run lint` before opening a PR.

## Coding Style & Naming Conventions
The codebase is TypeScript-first with `strict` mode enabled in `tsconfig.json`. Follow the existing style: 2-space indentation, semicolons, single quotes, and named imports grouped by source. Use PascalCase for React components (`CubeCanvas.tsx`), camelCase for hooks and utilities (`usePanRotation.ts`, `cubeModel.ts`), and keep route filenames aligned with Expo Router conventions. Use the `@/*` path alias when it improves clarity.

## Testing Guidelines
There is no dedicated test runner configured yet. For now, treat `npm run lint` as the minimum quality gate and verify behavior manually in Expo on at least one target platform you changed. When adding tests, place them next to the feature as `*.test.ts` or `*.test.tsx` and prefer React Native friendly tooling.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects (`Initial commit`, `empty project`). Keep that format: one concise summary line, capitalized, no trailing period. PRs should explain user-visible changes, list the platforms exercised (`android`, `ios`, `web`), and include screenshots or screen recordings for UI updates. Link the relevant issue when one exists.

## Configuration Notes
Do not commit secrets or machine-specific environment files. If you touch native configuration under `android/` or `ios/`, document why in the PR because those changes are harder to review than changes under `app/`.

## No Guessing
No guessing.
No guessing.
No guessing.

For numeric view, geometry, camera, projection, picking, or interaction tuning:
- Do not tune by eyeballing screenshots.
- Do not tune by “trying a few angles”.
- Do not infer exact matrices or parameters from a single screenshot unless the derivation is mathematically well-posed and explicitly shown.
- Derive values from source data, instrumented runtime state, optimization with a defined objective, or direct user-provided exact values.
- If the problem is underdetermined, say that clearly and use an exact capture/export path instead of guessing.

Cube centering rule:
- The cube must remain centered in the actual measured canvas.
- Use the real laid out canvas size, not assumed window dimensions, when computing render placement or picking.
- Keep the render origin stable during interaction and animation; do not dynamically recenter per frame from visible polygons unless that behavior is explicitly required and mathematically justified.
