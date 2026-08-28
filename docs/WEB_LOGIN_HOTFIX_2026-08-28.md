# Web login hotfix — 2026-08-28

The live site was unexpectedly rebuilt from commit 3ee36df on the production
branch. That commit kept package version 1.22.25 and the older popup login,
overwriting the verified 1.22.26 web deployment.

This hotfix begins at 3ee36df so today's /buy and /terms work remains intact. It
ports only the already released 1.22.26 editor changes and Google authentication
repair. It does not contain the current worktree's AI rendering, point checkout,
mobile capture repair, Worker migration, Play Billing changes or privacy update.

For hosted web, clicking Sign in now constructs the same-tab Google authorization
URL immediately. The URL uses the registered callback
https://homedesignerapp.com/app/, an unpredictable nonce, JSON state containing
only a validated same-origin return path, and prompt=select_account. The callback
checks issuer, audience, nonce and expiry before accepting the credential,
removes bearer data from browser history, and returns to the original app route.

Native Capacitor login still initializes and uses the native Social Login
provider. Web session restoration after a successful callback also retains the
existing provider-compatible stored credential and server-side token checks.
