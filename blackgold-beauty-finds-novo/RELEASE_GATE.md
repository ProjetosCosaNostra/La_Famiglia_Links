# BlackGold Beauty Finds — Production Release Gate

Production is intentionally blocked.

A production release is permitted only after all of these conditions are true:

1. The exact visual authority gates pass for desktop and mobile.
2. The wide-screen regression gate passes.
3. The public catalog is still in the required pre-release state.
4. The user explicitly approves the visual result.
5. `release-approval.json` is created from the template and pinned to the exact approved Git commit.
6. The approved desktop/mobile mockup hashes match the pinned authority manifest.
7. The placeholder D1 database id is replaced with the real production binding.
8. Required Cloudflare secrets/bindings are configured.
9. A Disaster Backup V2 is generated immediately before deployment.
10. Production deployment remains a separate explicit action.

Current state: **BLOCKED BY DESIGN**.

The release preflight command is:

`node tools/release_preflight.mjs`

CI verifies the opposite state before approval:

`node tools/release_preflight.mjs --expect-blocked`

No script in this repository should auto-open a preview or auto-deploy production.
