# Desktop GitHub releases

Release publication is fully automated: a candidate build is verified by CI
workflows on Windows and macOS runners, and the publisher only ever publishes
artifacts that both workflows bound to the same tag and commit. There is no
human QA gate; checks that cannot execute in CI are recorded as `SKIP`, which
repository policy accepts.

## Candidate build

1. Confirm package.json, src-tauri/tauri.conf.json, and Cargo.toml use the same SemVer version.
2. Push an immutable `vX.Y.Z` tag to a commit whose `Desktop PR checks` run passed. The `Release candidate` workflow verifies the tag object and peeled commit, builds a macOS universal DMG and Windows x64 current-user NSIS installer, verifies the macOS `arm64` + `x86_64` slices and ad-hoc signature, and confirms the Windows installer is unsigned.
3. The candidate artifact (`release-candidate`) contains exactly `ForgeX_X.Y.Z_universal.dmg` and `ForgeX_X.Y.Z_x64-setup.exe`, plus `candidate-manifest.json` (run, tag-object, commit and file hashes) and `SHA256SUMS`.

The candidate workflow starts **only** when an immutable `vX.Y.Z` tag is pushed; it does not have a manual dispatch that could build an arbitrary branch.

## Automated verification

Dispatch **Verify candidate** with the tag and the candidate run ID. The workflow:

- binds to the tag (tag object, peeled commit, candidate run identity and hashes are re-verified against the `candidate-manifest.json`);
- on a Windows runner: verifies artifact SHA-256 sums, silently installs the NSIS installer, launches the packaged app and requires the process to stay alive, then silently uninstalls and requires removal;
- on a macOS runner: verifies the SHA-256 sums, mounts the DMG, verifies the ad-hoc signature and bundle version, launches the arm64 slice and requires it to stay alive;
- records `candidate-verification.json` binding every check to the candidate identity, with `PASS` (evidence recorded) or `SKIP` (reason recorded) statuses.

`SKIP` is an accepted outcome by repository policy for checks that cannot run on ephemeral CI runners: SmartScreen / Smart App Control / managed-policy prompts, Gatekeeper first-open on Intel hardware, Start-menu shortcut matrices, and prior-version upgrade paths. The browser-side regression suite (including WebP WASM conversion, multi-file/zip flows, and every tool's e2e path) is covered by the `Desktop PR checks` web job, which must have succeeded on the candidate commit; the verifier cites that run as evidence.

## Publication

Run **Publish release** from Actions with:

- `tag`: the existing candidate tag
- `candidate-run-id`: the successful candidate workflow run ID

The publisher re-verifies the candidate manifest and hashes, requires a successful **Verify candidate** run for the tagged commit, downloads and validates its `candidate-verification.json` against the candidate manifest, takes an atomic repository-ref publication lease, creates a draft containing only the DMG, NSIS setup and SHA256SUMS, verifies the asset set, then makes the draft public and releases the lease. A stale lease can be taken over only after its owner run is completed and the lock is at least 45 minutes old.

## One-time repository settings

1. Protect release tags (`v*`) so only release maintainers can create them and existing tags cannot be moved or deleted.
2. Require `Desktop PR checks / web` and both `desktop` matrix jobs before merging. Add them as required status checks in branch protection. The candidate and publisher workflows both refuse a commit without a successful Desktop PR checks run.
3. Enable GitHub Actions artifact retention and release permissions for the repository. The publisher needs permission to create/delete the temporary `release-publication-lock` ref; if repository rules forbid it, the workflow fails closed.

(The former `release-qa` GitHub Environment with required reviewers is no longer part of the flow and may be deleted.)

## Artifact and trust policy

The v1 targets remain those in the product spec: Windows 11 x64 current-user NSIS and macOS 14+ universal DMG. The NSIS installer is intentionally unsigned; the app is ad-hoc signed and not notarized. Release notes must disclose SmartScreen, Smart App Control, Gatekeeper, MDM-policy, and Windows WebView2 bootstrapper limitations. Runtime operation is offline; Windows installation can require network access for WebView2. There is no app updater; users manually download future releases.

Automated CI verification is not real-world acceptance on user machines: the skipped checks above remain disclosed limitations of this policy rather than claims of support.
