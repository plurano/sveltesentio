# ADR-0060: Repository namespace moves to `plurano/sveltesentio`

- **Status**: Accepted
- **Date**: 2026-11-23
- **Deciders**: @lusoris (user, through the fleet decision ledger entry `fleet-org-moves-now-20261120`)
- **Supersedes**: [ADR-0053](0053-namespace-and-npm-scope.md), replacing its repository namespace clause; its npm scope and supply-chain clauses carry over unchanged and are restated below

## Context

[ADR-0053](0053-namespace-and-npm-scope.md) placed the repository at `github.com/golusoris/sveltesentio` and the packages under the `@sveltesentio/*` npm scope. On 2026-11-20 the fleet moved its repositories from the `golusoris` organisation to `plurano` with their names unchanged. Since then `gh api orgs/golusoris/repos` lists only `golusoris/.github`, and old addresses reach this repository only through the forge redirect.

The name Plurano comes from Latin _plures_, "many", as in "out of many, one", and is pronounced plu-RAH-no (organisation profile, `plurano/.github` `profile/README.md`). The organisation holds the shared libraries and frameworks of the fleet, among them this repository and the Go framework `plurano/golusoris`.

Some tools compare the repository identity exactly and do not follow the redirect. npm trusted publishing checks the organisation, repository and workflow that are stored per package. Release run 45071162036 on merge commit `28f35fd` (release pull request 507) failed in its publish step: the OIDC token exchange returned 404, and the publish of `@sveltesentio/collab@0.7.0` returned 404, because the stored trusted publisher still named `golusoris`.

## Decision

1. **Repository namespace**: `github.com/plurano/sveltesentio`. Every reader-facing link, badge and command names this address, and so does `repository.url` in each published manifest, which npm provenance requires to match the publishing repository exactly.
2. **npm scope**: `@sveltesentio/*`, unchanged from ADR-0053. The scope is independent of the forge organisation, and the reasons for a dedicated scope in ADR-0053 still hold: a separate publishing permission set, its own 2FA policy and isolated provenance attestation.
3. **Supply-chain hygiene**: 2FA on the npm scope, secret scanning and branch protection on the repository, unchanged from ADR-0053 and configured under [issue #31](https://github.com/plurano/sveltesentio/issues/31).
4. **npm trusted publishers**: each package's trusted publisher names `plurano`, repository `sveltesentio`, workflow `release-please.yml` and no environment. The operator re-points the packages whose current version is missing from the registry before the next publish run; the remaining packages keep the old configuration until the two days before their next release, tracked in [issue #676](https://github.com/plurano/sveltesentio/issues/676).
5. **Generated identity files**: the owner in `.standards.yaml` and the files generated from it (compiled agent rule files, the devcontainer, the managed governance block in `README.md`, the standards baseline, the agent checkpoint and the harness files) change through a re-adopt with owner `plurano`, after the governance engine accepts the new owner. They are not edited by hand, because the audit checks each of them against its generator.
6. **Go module path**: the Go framework lives at `github.com/plurano/golusoris`, but its `go.mod` keeps `module github.com/golusoris/golusoris` until a separate module rename. Links name the repository address; import paths name the module path.

## Alternatives considered

- **Stay at `golusoris/sveltesentio`**: not possible. The repository has already moved, the old organisation holds only its `.github` repository, and the redirect ends once the old organisation is given up.
- **Edit ADR-0053 in place**: rejected. An accepted record stays as written; a superseding record keeps the reason for the old namespace readable, the same way [ADR-0059](0059-paraglide-3-i18n-default.md) supersedes [ADR-0017](0017-paraglide-v2-i18n-default.md).
- **Move the npm scope along with the organisation**: rejected. A new scope renames every package, breaks every consumer import without a technical reason, and gives up the isolation that ADR-0053 chose the dedicated scope for.

## Consequences

**Positive**:

- Links, badges and the attestation command in `SECURITY.md` resolve without the forge redirect (pull request 677).
- Provenance attestations and `repository.url` (pull request 675) name the same repository, so a re-pointed trusted publisher accepts the publish.

**Negative / trade-offs**:

- Publishing waits on an operator act per package: a package whose trusted publisher still names `golusoris` fails to publish until it is re-pointed.
- Until the re-adopt lands, the generated identity files still name `golusoris`.
- History keeps the old names: the bodies of ADR-0051, ADR-0053 and ADR-0054, the changelogs and the changelog test fixture (`scripts/release-changelog-format.test.mjs`) stay as they were written.
- ADR-0053 named downstream application repositories `golusoris/app-*`; on 2026-11-23 the forge returns 404 for `golusoris/app-arca` and `plurano/app-arca`, so this record names no application repository.
- The Go module path and the repository address differ until the module rename.

**Revisit trigger**: another organisation move, a rename of the repository, or a proposal to change the npm scope.

## Evidence

- `gh api orgs/golusoris/repos` on 2026-11-23: one repository, `golusoris/.github`.
- `git remote get-url origin` on 2026-11-22: `https://github.com/plurano/sveltesentio`.
- `plurano/.github` `profile/README.md`, section "Name": origin and pronunciation of Plurano.
- Release run 45071162036 (merge commit `28f35fd`), step "Publish packages to npm": `ERR_PNPM_AUTH_TOKEN_EXCHANGE` with status 404, then `ERR_PNPM_FAILED_TO_PUBLISH`.
- npm documentation, trusted publishers page: `repository.url` in `package.json` must exactly match the GitHub repository for a publish from GitHub.
- Pull request 675 (`fb40bcc`) moves `repository.url` to `plurano/sveltesentio` in the 20 manifests; pull request 677 (`dd8c00c`) moves the reader-facing links and badges.
- `plurano/golusoris` `go.mod` on 2026-11-23: `module github.com/golusoris/golusoris`.
- Fleet decision ledger, `fleet-org-moves-now-20261120`, 2026-11-20: move the fleet repositories from `golusoris` to `plurano` with names unchanged, update hard-coded organisation references in each repository and keep Go module paths until the module rename (paraphrased).
- Fleet decision ledger, `sveltesentio-org-move-identity-rest`, 2026-11-23: generated identity files move only through a re-adopt with owner `plurano` after the engine accepts new owners; this record supersedes ADR-0053 and serves as the rename note; ADR bodies and the changelog test fixture stay as history (paraphrased).
