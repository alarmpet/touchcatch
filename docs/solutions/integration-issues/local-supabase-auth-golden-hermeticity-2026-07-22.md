---
title: Hermetic local Supabase Auth integration gates
date: 2026-07-22
category: integration-issues
module: local-supabase-auth-golden
problem_type: integration_issue
component: authentication
symptoms:
  - Local Auth verification depended on an ignored credential-bearing status file and failed in a clean checkout.
  - Real Supabase Auth methods failed because receiver-dependent methods were invoked unbound.
  - Cleanup could report success while leaving the exact test-created Auth user behind.
  - Database integration tests used nonportable local Supabase status discovery.
  - A one-page Mailpit lookup missed an owned message behind more than 100 unrelated messages.
root_cause: incomplete_setup
resolution_type: tooling_addition
severity: high
related_components:
  - testing_framework
  - database
  - tooling
tags:
  - local-supabase
  - gotrue
  - authentication
  - integration-testing
  - cleanup
  - test-isolation
  - ci-portability
  - pkce
---

# Hermetic local Supabase Auth integration gates

## Problem

The local Supabase Auth golden was not reproducible from a clean checkout. It depended on an ignored status file, while real client calls and cleanup behavior differed from their mock-based contract tests.

## Symptoms

- A clean-checkout auth gate could not obtain local Supabase status.
- Real `signUp` and `exchangeCodeForSession` calls threw errors while accessing client storage or initialization state.
- Teardown could silently miss a created user.
- Database concurrency helpers depended on environment-specific CLI discovery.

## What Didn't Work

- Reading an ignored credential file made the current workstation pass but left CI and clean clones without the prerequisite.
- Calling an extracted Supabase Auth method as a plain function lost the object's `this` receiver.
- Treating “user not found” as successful cleanup hid incomplete pagination or lookup failures.
- Resolving the CLI through a workstation-specific absolute path made tests nonportable.

## Solution

Probe the fixed GoTrue health URL first, before environment or CLI status discovery, with a two-second abort signal. This keeps health failure ordering deterministic and prevents discovery work from masking an unavailable service.

Use a tracked status helper that first consumes explicit process environment fields. When they are incomplete, run the project-local CLI through the current Node process with bounded, quiet options and parse its output only in memory:

```ts
const stdout = execFileSync(
  process.execPath,
  [resolve(repositoryRoot, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  },
);
```

Validate every returned service URL as loopback-only, require every field, and replace all CLI or parse failures with a sanitized `LOCAL_SUPABASE_UNAVAILABLE` error.

Preserve the receiver whenever an extracted real Supabase client method is invoked:

```ts
await signUp.call(dependencies.auth, input);
await exchangeCodeForSession.call(dependencies.auth, code);
```

For teardown, search a bounded number of pages for the exact run-owned email, delete only the returned exact user ID, and then run a bounded database query proving that exact ID-and-email pair is absent. Fail the hook if any step or postcondition fails.

Mailpit discovery must also paginate with bounded page count and per-request timeouts. Match the exact recipient, retain only those message IDs, and delete only the retained owned set. A regression fixture with more than 100 unrelated messages proves cleanup does not depend on the first page.

Database tests should consume `TEST_DATABASE_URL` first and keep only a repository-relative CLI fallback.

## Why This Works

The env-first path keeps credentials process-only in CI and restricted sandboxes. The bounded CLI fallback makes a normal clean checkout work after local Supabase starts without persisting credentials. Receiver binding matches how the Supabase client stores initialization and PKCE state. Health-first ordering yields an unambiguous precondition failure. Bounded pagination plus an exact deletion postcondition prevents false success and cross-run deletion.

## Prevention

- Make fixed health checks the first observable setup action.
- Use class-based receiver-sensitive fakes for every extracted SDK method.
- Force later-page discovery with more than one page of unrelated fixtures.
- Treat deletion as complete only after a bounded exact-absence query succeeds.
- Treat ignored credential artifacts as local launch inputs, never tracked-test prerequisites.
- Exercise receiver-dependent SDK methods with a real client, not only function mocks.
- Require cleanup to distinguish “verified deleted” from “lookup exhausted.”
- Bound every subprocess, HTTP request, and polling loop; sanitize failures before they reach test output.
- Test explicit environment discovery and project-local CLI fallback separately.

## Related Issues

- No related solution documents existed when this learning was captured.
