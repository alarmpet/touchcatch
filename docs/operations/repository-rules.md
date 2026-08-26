# Repository rules

Protect `main` with pull requests and require the CI checks `check`, `database`, and `server`. `server` is required because root `typecheck` does not include `apps/server`. The `mobile` job is a parallel fail-fast duplicate of `mobile:check` inside `check`; keep it but do not treat it as extra production evidence. Do not allow force pushes or branch deletion. The workflow uses only the local ephemeral Supabase stack; it does not require production credentials. Job names say `local contract/build evidence` on purpose.

These settings must be applied and verified by a repository administrator after the repository is created. Committed workflow configuration alone does not prove that branch protection is active.
