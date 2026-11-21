# ADR-0059: Paraglide 3 (`@inlang/paraglide-js@^3`) as framework i18n default

- **Status**: Accepted
- **Date**: 2026-11-21
- **Deciders**: @lusoris (user, through the fleet decision ledger entry `sveltesentio-paraglide-3-major`)
- **Supersedes**: [ADR-0017](0017-paraglide-v2-i18n-default.md)

## Context

[ADR-0017](0017-paraglide-v2-i18n-default.md) locked `@inlang/paraglide-js@^2.16.0` as the framework i18n default and dropped the deprecated `@inlang/paraglide-sveltekit` adapter in favour of `paraglideVitePlugin()`. `packages/i18n/package.json` declares `"@inlang/paraglide-js": ">=2.0.0"` in `peerDependencies`, which already admits Paraglide 3 for downstream consumers while Renovate pull request 604 proposes moving the workspace `devDependencies` range from `^2.25.1` to `^3`.

Upstream `@inlang/paraglide-js` (`github.com/generaltranslation/paraglide-js`, MIT, documentation at <https://paraglidejs.com>) published `3.0.0` on 2026-11-03 and `3.2.2` on 2026-11-10, following `2.25.1` on 2026-09-08 (measured 2026-11-21). Upstream `CHANGELOG.md` for `3.0.0` records three breaking changes:

- Commit `f65ba59` removes the `additionalFiles` compiler option (configurations passing it fail with migration guidance); the CLI now emits TypeScript declarations by default, while the programmatic compiler and the non-Vite bundler plugins keep `emitTsDeclarations: false` as their default.
- Commit `05a3e17` removes `experimentalMiddlewareLocaleSplitting` (the runtime no longer exports `trackMessageCall`), replaced by `experimentalPerLocaleBuild: true` for Vite applications.
- Commit `eb5dc1d` adds `outputStructure: "virtual-modules"` as the default for the Vite integration in development and production: public runtime and message entry points remain on disk while message implementations are served virtually through the Vite plugin (`"virtual-modules"` rejects `emitTsDeclarations: false` and any `messageModuleSize` other than `1`, whereas CLI and non-Vite bundler defaults stay unchanged). Standalone Node scripts or grouped-output builds must select `"message-modules"` or `"locale-modules"`. In `3.2.2` the Vite plugin turns declarations on by default for `"virtual-modules"` and refuses an explicit `emitTsDeclarations: false` (`dist/bundler-plugins/virtual-messages.js`), although the `3.0.0` changelog entry of `f65ba59` describes the bundler plugin default as `false`.

In `@inlang/paraglide-js@3.2.2` (`dist/bundler-plugins/vite.js`), `paraglideVitePlugin()` without `experimentalPerLocaleBuild` returns `createVirtualMessagesPlugins(...)` (`[paraglide-virtual-messages, unplugin-paraglide-js, optimize]`), whereas v2 returned the compiler plugin alone. Before this change (`main` at `e52de45`), no file under `packages/`, `apps/` or `docs/` set or used `additionalFiles`, `experimentalMiddlewareLocaleSplitting`, `trackMessageCall`, `outputStructure`, `messageModuleSize` or `emitTsDeclarations`. The public surface of `@sveltesentio/i18n` (`packages/i18n/src/index.ts`) re-exports `paraglideVitePlugin` unchanged, and the SvelteKit integration pattern of [ADR-0017](0017-paraglide-v2-i18n-default.md) is unchanged in Paraglide 3.

## Decision

1. Move the workspace `devDependencies` range for `@inlang/paraglide-js` in `packages/i18n/package.json` to `^3` (via Renovate pull request 604) so default CI builds and unit tests run against Paraglide 3.
2. Keep `peerDependencies["@inlang/paraglide-js"]` at `>=2.0.0` in `packages/i18n/package.json`, keeping the consumer package surface (`packages/i18n/src/index.ts` and subpath exports) unchanged.
3. Retain all architectural commitments of [ADR-0017](0017-paraglide-v2-i18n-default.md) except the v2 version lock: no separate `@inlang/paraglide-sveltekit` adapter, direct `paraglideVitePlugin()` wiring in `vite.config.ts`, `paraglideMiddleware()` in `hooks.server.ts`, `reroute()` in `hooks.ts`, and `<html lang="%lang%" dir="%dir%">` placeholders in `app.html`.
4. Update package and compose documentation (`packages/i18n/AGENTS.md`, `packages/i18n/README.md`, `docs/compose/i18n-runtime-strategy.md`, and `docs/compose/internationalization-routing.md`) to reflect Paraglide 3 Vite defaults.

## Alternatives considered

- **Hold `@inlang/paraglide-js` on v2 via Renovate `allowedVersions: "<3"`**: Keeps workspace CI on `2.x` while `peerDependencies` (`>=2.0.0` in `packages/i18n/package.json`) admits `3.x`, leaving downstream Paraglide 3 consumers untested in CI.
- **Leave Renovate pull request 604 open until a separate `D*` row closes**: Stalls routine major-version maintenance even though the SvelteKit integration contract, `MIT` license, and `@sveltesentio/i18n` public exports are unchanged.

## Consequences

**Positive**:

- Default CI tests `@sveltesentio/i18n` against the current upstream major (`^3`), while downstream consumers on Paraglide 2 or Paraglide 3 satisfy `peerDependencies` (`>=2.0.0`) without a breaking framework release.
- Vite consumers on Paraglide 3 get `outputStructure: "virtual-modules"` by default in development and production without writing per-message implementation files to disk.

**Negative / trade-offs**:

- Standalone Node scripts or non-Vite tools importing generated messages directly from disk on Paraglide 3 require an explicit physical `outputStructure` (`"message-modules"` or `"locale-modules"`), because virtual modules require the Vite plugin.
- Consumers on Paraglide 2 stay inside the `>=2.0.0` peer range, but no CI job installs Paraglide 2 once pull request 604 lands. The peer-floors job (`.github/workflows/peer-floors.yml`) pins only the peers in `FLOORED_PEERS` of `scripts/pin-peer-floors.mjs` (`svelte`, `@sveltejs/kit`, `vite`, `typescript`, `layerchart`), so the `2.0.0` floor was not tested before this change either.

**Revisit trigger**: A Paraglide 4 major, or a reported break for a consumer on Paraglide 2, which no CI job tests (see above).

## Evidence

- npm registry metadata for `@inlang/paraglide-js` (measured 2026-11-21): `2.25.1` (`2026-09-08`), `3.0.0` (`2026-11-03`), `3.2.2` (`2026-11-10`); `MIT` license, repository `github.com/generaltranslation/paraglide-js`, homepage <https://paraglidejs.com>.
- Upstream `@inlang/paraglide-js` `CHANGELOG.md` (`3.0.0`: commits `f65ba59`, `05a3e17`, `eb5dc1d`) and `@inlang/paraglide-js@3.2.2` `dist/bundler-plugins/vite.js` (`createVirtualMessagesPlugins` returning `[paraglide-virtual-messages, unplugin-paraglide-js, optimize]`).
- `@inlang/paraglide-js@3.2.2` `dist/bundler-plugins/virtual-messages.js` (declaration default and the `emitTsDeclarations: false` refusal for `"virtual-modules"`) and `dist/compiler/compile-project.js` (`"virtual-modules"` requires the Vite plugin).
- Repository search across `packages/`, `apps/` and `docs/` at `main` `e52de45`: zero occurrences of `additionalFiles`, `experimentalMiddlewareLocaleSplitting`, `trackMessageCall`, `outputStructure`, `messageModuleSize` or `emitTsDeclarations`.
- `packages/i18n/src/index.ts` and `packages/i18n/test/reexports.test.ts`: `paraglideVitePlugin` identity re-export test passes on Paraglide 3; plugin-name test updated in pull request 658 to match `unplugin-paraglide-js` anywhere in the returned plugin list.
- `scripts/pin-peer-floors.mjs` (`FLOORED_PEERS`) and `.github/workflows/peer-floors.yml`: `@inlang/paraglide-js` is not a floored peer, so no job installs its `2.0.0` floor.
- Fleet decision ledger, `sveltesentio-paraglide-3-major`, 2026-11-21: move the `@inlang/paraglide-js` development dependency to `^3` via Renovate pull request 604, keep the `>=2.0.0` peer range, supersede ADR-0017 with a revisit trigger, and update documentation to Paraglide 3 Vite defaults (paraphrased).
