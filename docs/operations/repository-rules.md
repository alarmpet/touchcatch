# Repository rules

Protect `main` with pull requests and require the CI checks `check` and `database`. Do not allow force pushes or branch deletion. The workflow uses only the local ephemeral Supabase stack; it does not require production credentials.

These settings must be applied and verified by a repository administrator after the repository is created. Committed workflow configuration alone does not prove that branch protection is active.
