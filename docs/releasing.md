# Releasing Better Color Highlight

Version preparation, Marketplace publication, and the GitHub release are
separate steps. Choose the version once and validate the final versioned tree.

## Prepare a version

1. Update `docs/release-notes-next.md` with the behavior changes and boundaries.
2. Run `pnpm release:version --release <version> --yes`. This updates the version,
   regenerates extension metadata and builds both runtime entries. It does not
   commit, create a tag, or push.
3. Run `pnpm release:check`. This checks formatting, lint, types, unit/snapshot
   tests, desktop and Chromium Web hosts, and an installed VSIX. Linux needs a
   display server, for example `xvfb-run -a pnpm release:check`.
4. Retain `dist/release.vsix`, the exact archive installed and validated by the
   package test. Copy it to `vscode-better-color-highlight-<version>.vsix` when
   a versioned filename is useful. Record its SHA-256 and validation environment
   in the release notes. The archive contains production bundles only;
   development test bundles and the
   test-only Kotlin language extension must stay excluded.
5. Review and commit the complete release changes. Keep this commit available
   for the later version tag. A preparation-only run ends here.

Unit tests finish before VS Code launches. Correctness checks have no fixed
wall-clock performance threshold; `pnpm bench` records timing trends separately.
CI runs the shared desktop activation, highlight, picker, alpha-editing, and
navigation checks on Ubuntu and Windows with both VS Code 1.140.0 (the minimum)
and stable. Web and installed-VSIX checks run on Ubuntu stable. Set
`VSCODE_VERSION=1.140.0` when running `pnpm test:e2e:electron` locally to select
that desktop host; build first with `pnpm build`.

## Publish the prepared version

With publisher credentials configured, run `pnpm release:publish`. It repeats
the complete checks and uploads the retained `dist/release.vsix` using
`vsce publish --packagePath`, without rebuilding or repackaging. It requires a
clean committed tree before and after validation, and never bumps the version.
`release:upload` is the internal final upload step; do not use it as the public
release entry point. Generated metadata must match the package version.

For a new, unversioned release, `pnpm release` combines the version prompt and
complete preparation checks. It stops before publication so the final changes
can be reviewed and committed. Do not use it after a version has already been
prepared.

Verify that Marketplace lists the expected version. Then create the matching
`v<version>` tag on the release commit and push that commit and tag. Pushing
the tag triggers `.github/workflows/release.yml`, which creates GitHub release
notes with the lockfile-pinned `changelogithub`; it does not publish the VSIX.
Verify the GitHub release independently. If either destination already has the
version, inspect its state before retrying; do not bump again to recover a
partially completed publication.

## Verify public availability

After uploading and creating the GitHub release, run:

```sh
pnpm release:verify-publication --version <version> --commit <full-release-commit-sha> --artifact dist/release.vsix --output /tmp/publication-verification.json
```

Use the retained tested/uploaded archive, never a fresh build. Alternatively,
pass `--sha256 <recorded-sha256>` instead of `--artifact` when verifying an
archived release. Defaults use the current package version, the local
`v<version>` tag's commit, and `dist/release.vsix`. Explicit expected evidence
also allows verification after later development or without a local tag.

The read-only verifier checks the public stable GitHub release, the remote
tag's resolved commit (including annotated tags), the tagged package identity
and version, the validated Marketplace listing, and the public versioned VSIX's
SHA-256. It never bumps, uploads, tags, or pushes. GitHub API requests can use
`GITHUB_TOKEN`; credentials are not forwarded to Marketplace or CDN requests.

Exit codes are `0` for verified, `2` for pending public availability or temporary
service failure, and `1` for mismatched evidence, invalid input, or an API error.
JSON reports keep each destination's status, so a pending GitHub release does
not conceal a Marketplace hash mismatch. Preserve pending evidence and rerun
the verification after synchronization; do not republish to repair a delay.
Malformed responses and access failures require investigation.

The manually dispatched **Verify publication** workflow accepts the version,
release commit SHA, and recorded VSIX SHA-256, and retains the JSON report as an
Actions artifact even when a destination is pending or mismatched. It requires
no Marketplace publishing credentials or dependency installation. Dispatch or
rerun this workflow after both publication steps; the tag-triggered release
workflow cannot infer the tested VSIX hash.

After both publications are verified, move the completed notes into
`docs/releases/v<version>.md` and start new next-release notes. Keep prepared
artifact hashes distinct from any later verification of Marketplace downloads.
