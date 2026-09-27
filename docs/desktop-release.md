# Desktop GitHub releases

The release process intentionally separates **candidate creation** from **publication** so a human can test the exact artifacts before the public release exists.

## Candidate build

1. Confirm package.json, src-tauri/tauri.conf.json, and Cargo.toml use the same SemVer version.
2. Push an immutable `vX.Y.Z` tag to a commit whose `Desktop PR checks` run passed. The `Release candidate` workflow verifies the tag object and peeled commit, builds a macOS universal DMG and Windows x64 current-user NSIS installer, verifies the macOS `arm64` + `x86_64` slices and ad-hoc signature, and confirms the Windows installer is unsigned.
3. Download the `release-candidate` artifact from that successful run. It contains exactly `ForgeX_X.Y.Z_universal.dmg` and `ForgeX_X.Y.Z_x64-setup.exe`, plus `candidate-manifest.json` (run, tag-object, commit and file hashes), `SHA256SUMS`, and a candidate-bound `qa-evidence.template.json`.

The candidate workflow starts **only** when an immutable `vX.Y.Z` tag is pushed; it does not have a manual dispatch that could build an arbitrary branch. After the QA evidence file is reviewed and committed, use `Publish release` (`workflow_dispatch`) to request publication of that candidate.

## Manual QA and publication

Install and test the candidate according to `.scratch/desktop-support/spec.md`. Every release-blocking check must have status `PASS` and evidence; all four manual matrix rows are required, including the Windows policy row. A `NOT_RUN`, missing, unknown or failed check blocks publication. Start from the candidate artifact's `qa-evidence.template.json` (the repository's `release-qa-evidence.example.json` is only an illustration); enter `status: PASS`, OS version/build, CPU, app version, package hash, steps, result, and screenshots for each manual matrix row. Fill in all required check results and set `allRequiredChecksPassed` to `true` only after the checks actually pass.

Commit the evidence JSON to the ForgeX repository. Copy its `raw.githubusercontent.com/Aiden-FE/forge-x/<40-char-commit>/...` URL and SHA-256, then run **Publish release** from Actions with:

- `tag`: the existing candidate tag
- `candidate-run-id`: the successful candidate workflow run ID
- `qa-evidence-url`: the immutable raw URL
- `qa-evidence-sha256`: SHA-256 of the exact evidence file bytes

The workflow fetches only that immutable repository blob, verifies it against the candidate manifest and artifact hashes, and requires the `release-qa` GitHub Environment approval before publishing. It downloads artifacts by run ID, not by mutable latest-run lookup. After approval it takes an atomic repository-ref publication lease, creates a draft containing only the DMG, NSIS setup and SHA256SUMS, verifies the asset set, then makes the draft public and releases the lease. A stale lease can be taken over only after its owner run is completed and the lock is at least 45 minutes old.

## One-time repository settings

1. Create GitHub Environment `release-qa` and configure required reviewers. The publisher checks this protection rule at runtime and fails closed if it is absent or unreadable. Verify the workflow token can read Environment protection rules on the first Actions run; if not, provide a narrowly scoped read-only repository token for that check rather than bypassing reviewer protection. Do not allow self-review if the repository policy can enforce that.
2. Protect release tags (`v*`) so only release maintainers can create them and existing tags cannot be moved or deleted.
3. Require `Desktop PR checks / web` and both `desktop` matrix jobs before merging. Add them as required status checks in branch protection. The tag workflow also refuses a commit without a successful Desktop PR checks run. Until these workflow files are pushed, GitHub has not run them and this one-time required-check setup cannot complete.
4. Enable GitHub Actions artifact retention and release permissions for the repository. The publisher needs permission to create/delete the temporary `release-publication-lock` ref; if repository rules forbid it, the workflow fails closed.
5. Require manual release evidence. Do not set an evidence attestation true merely to exercise the workflow.

## Artifact and trust policy

The v1 targets remain those in the product spec: Windows 11 x64 current-user NSIS and macOS 14+ universal DMG. The NSIS installer is intentionally unsigned; the app is ad-hoc signed and not notarized. Release notes must disclose SmartScreen, Smart App Control, Gatekeeper, MDM-policy, and Windows WebView2 bootstrapper limitations. Runtime operation is offline; Windows installation can require network access for WebView2. There is no app updater; users manually download future releases.

The public release workflow does not claim that artifact creation proves real OS acceptance. Human QA is a required gate, and every not-run platform or trust check must remain `NOT_RUN`, which makes publication fail.
