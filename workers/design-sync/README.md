# HomeDesigner plan sync

This Worker keeps signed-in users' projects in the private
`homedesigner-user-data` R2 bucket. It accepts only Google ID tokens issued for
HomeDesigner's web OAuth client, then namespaces every object by the verified
Google `sub`. ID tokens are never written to storage.

Deploy from this directory with `npm ci`, `npx wrangler r2 bucket create
homedesigner-user-data`, then `npm run deploy`. The resulting `workers.dev` URL
must match `VITE_CLOUD_SYNC_URL` in the app's production environment.
