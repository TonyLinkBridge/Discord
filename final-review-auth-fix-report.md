# Final Review: Authenticated Mutation Boundary

## Outcome

Every mutation exposed to the browser now crosses a real Next.js Server Action before the deterministic local store changes. The action strictly validates a discriminated command, re-reads the current environment and NextAuth Discord session, re-applies the operator allowlist, and returns the validated command with the trusted actor identity. The browser-facing provider has no `actorId` parameters and binds the server-returned identity when it invokes the internal actor-aware local store.

The ten protected mutation commands are:

- complete priority;
- update lead action;
- complete lead action;
- update member;
- verify member;
- record member action;
- create tracked link;
- atomically create campaign and tracked link;
- update offer;
- update content entry.

## Trust boundary

`authorizeAdminMutation` is the production Server Action. For every request it:

1. parses the unknown input with the strict `adminMutationCommandSchema`;
2. rejects unknown properties, including a caller-supplied `actorId`;
3. calls `getAdminAuthEnvironment()` and `getAuthenticatedDiscordUserId()` for the current request;
4. accepts only an allowlisted Discord identity, except for an explicit nonempty `DEV_OPERATOR_ID` when `NODE_ENV` is exactly `development`;
5. returns the parsed command and trusted actor identity.

Missing credentials, a missing session, revoked allowlist membership, and an unapproved identity fail closed. Production ignores `DEV_OPERATOR_ID`. Development without an explicit operator still requires the Discord allowlist.

`AdminDataProvider` is now the browser contract and contains no actor parameters. `ActorAwareAdminDataStore` is the internal adapter contract. `createAuthorizedAdminDataProvider` waits for the Server Action gate, verifies that the returned command kind matches the requested operation, and only then applies the returned validated command to the store with the trusted actor.

## Deterministic local mode and future adapters

The application intentionally remains browser-local and deterministic because no database or RayName Marketing API is available in this phase. Tests inject a strict deterministic gate that returns `local-ray`; the production admin layout injects only the real `authorizeAdminMutation` Server Action.

This phase does not claim durable audit storage or cross-user state. A future Neon, Discord, or RayName Marketing API adapter must execute the same validated `AdminMutationCommand` on the server after `requireAdminActor` succeeds. It must not move the current actor-aware store interface into the browser, accept an actor from request data, or treat this browser-local audit list as durable evidence.

## TDD evidence

The implementation was developed from observed RED failures:

- actor and command tests initially failed because `require-admin-actor` and `mutation-command` did not exist;
- the action-core test initially failed because `authorize-admin-mutation` did not exist;
- all-command wrapper tests initially failed because `authorized-provider` did not exist;
- the production-layout test failed with zero calls to the Server Action gate;
- the development-without-explicit-operator test exposed an unintended allow-any-development-session path by resolving actor `7` instead of rejecting;
- TypeScript reported every remaining old actor-aware test double and call signature after the browser contract changed.

The focused mutation suite then passed twice. The final focused pass covered 14 files and 111 tests.

## Verification evidence

- Focused auth/mutation/features: 111 passed.
- Full Vitest suite: 29 files, 185 passed.
- TypeScript: `tsc --noEmit` passed.
- ESLint: `eslint .` passed.
- Next.js 16.3.2 production build: passed.
- Playwright: 41 passed across operator journey, accessibility, and responsive coverage.
- `git diff --check`: passed.

The unit suite still emits pre-existing React `act(...)` warnings in offer, content, and admin-shell tests; they are not failures introduced by this boundary change. The first sandboxed Playwright attempt could not bind `127.0.0.1:3113` (`EPERM`); the approved localhost run passed all 41 tests.
