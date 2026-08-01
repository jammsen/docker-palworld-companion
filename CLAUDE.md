# CLAUDE.md

Companion **sidecar container** for [jammsen/docker-palworld-dedicated-server](https://github.com/jammsen/docker-palworld-dedicated-server): web operation panel + Discord status card & bot (Node 26, Hono/Hono-JSX, discord.js, esbuild-bundled to a single `companion.mjs`).

## Commands

- `npm ci` - install (Node 26; no host Node needed - everything also runs via `./docker-build.sh`)
- `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` - the Docker image build runs all four inside its build stage, so a red test or lint error fails the image build (`lint` = Biome check+format, `lint:fix` applies safe fixes)
- `npm run dev` + `npm run mock` - local dev against the mock Palworld REST server; `dev` loads `dev/dev.env` via `--env-file`

## Architecture

- **`CONTRACT.md` is the authoritative interface** to the gameserver container (volumes, env vars, event-line format, settings-overrides semantics). Any change touching that boundary MUST update CONTRACT.md and stay compatible with the gameserver repo's shell side (`includes/gameevents.sh`, `includes/config.sh`).
- Each container owns exactly one writable surface: game volume is mounted read-only here; this container owns `COMPANION_DATA_DIR` (state.json, companion-events.log, settings-overrides.env).
- `test/schema-drift.test.ts` guards settings-schema sync against a **local checkout** of the [gameserver repo](https://github.com/jammsen/docker-palworld-dedicated-server), found on disk as parent or sibling (`../docker-palworld-dedicated-server`); the test skips itself when no local checkout exists (e.g. in this repo's CI).

## Conventions

- **Conventional Commits are mandatory** (`feat:`, `fix:`, `ci:`, `docs:`, ...). The history is clean conventional commits end to end - keep it that way, it is the input for automated versioning.
- **Versioning: automatic semver via release-please** (googleapis/release-please-action, manifest-driven: `release-please-config.json` + `.release-please-manifest.json`). Flow: conventional commits merge develop→main → release-please maintains a Release PR on main (version bump in package.json + CHANGELOG.md) → merging that PR creates tag `vX.Y.Z` + the GitHub Release → the tag push triggers `docker-build-and-push-prod.yml` (image tags `X.Y.Z` + `latest`). `develop` branch → `develop` image tag; SHA7 tags are gone. `package.json` version feeds `COMPANION_VERSION` via `build.mjs`. Known caveat: the Release PR is opened with GITHUB_TOKEN, so the unittest workflow does not run on it (GitHub limitation) - it only touches changelog/version files.
- **Branches:** work lands on `develop`, releases go to `main` (GitHub default).
- **Git:** never push or delete remote state - propose commits/branches and let the maintainer give the final order and push.
- **Dependencies:** everything exact-pinned (no `^`/`~`), base images digest-pinned. Green CI = batch-mergeable for dev-tooling bumps. Node runtime bumps happen as ONE coordinated change: Dockerfile digests (both stages) + CI `node-version` + `@types/node` + esbuild `target` (currently Node 26).
- Verify shell scripts with `shellcheck -x` (none in this repo today, but applies to any that get added).
