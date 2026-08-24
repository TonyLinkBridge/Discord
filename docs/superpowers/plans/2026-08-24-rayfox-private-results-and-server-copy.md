# RayFox Private Results and Server Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver private RayFox command outcomes and consistent, action-oriented official copy across the RayName Discord server.

**Architecture:** Preserve Discord interaction responses as ephemeral messages and use the existing server-only Discord REST client only for delayed verification outcomes. Treat Discord channel copy as an operational content layer: edit only official topics, pinned guidance, and RayName-authored starter messages.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Discord Interactions API, Discord REST API, Discord web client.

**Spec:** `docs/superpowers/specs/2026-08-24-rayfox-private-results-and-server-copy-design.md`

## Global Constraints

- Immediate Slash Command results remain ephemeral.
- Important verification outcomes may be sent by DM.
- Failed DMs never roll back verification state.
- Do not invent renewal or VIP events without a provider-backed source.
- Do not edit member-authored content.

---

### Task 1: RayFox private outcome copy

**Files:**
- Modify: `src/lib/discord/rest-client.test.ts`
- Modify: `src/lib/discord/rest-client.ts`

**Interfaces:**
- Consumes: `DiscordRoleClient.notifyReviewOutcome({ discordUserId, outcome, safeReason? })`
- Produces: formatted approval/rejection direct messages with safe RayName and support links.

- [x] **Step 1: Write the failing test**

Assert that approval and rejection DMs identify RayFox/RayName, bold the outcome, include the official RayName URL, preserve a safe rejection reason, and never include applicant email or domain data.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/discord/rest-client.test.ts`

Expected: FAIL because the current plain text does not contain the approved Markdown structure and link.

- [x] **Step 3: Write minimal implementation**

Update only the two outcome message strings in `notifyReviewOutcome`. Keep the existing DM channel creation, message send, and safe failure behavior unchanged.

- [x] **Step 4: Run focused tests**

Run: `npm test -- src/lib/discord/rest-client.test.ts src/lib/discord/interactions.test.ts src/lib/verification/service.test.ts`

Expected: PASS; interaction tests continue asserting `flags: 64`.

### Task 2: Server-wide official copy pass

**Files:**
- No repository source files. Mutate Discord server content through the authenticated browser session.

**Interfaces:**
- Consumes: existing guild/channel IDs and current official RayName-authored guidance.
- Produces: purpose-specific topics and official guidance with headings, bold actions, channel mentions, and masked RayName links.

- [x] **Step 1: Inventory official content**

Inspect Rules, Start Here, Community, RayName, and VIP Desk channels. Record which channels have a topic, starter message, or pinned message.

- [x] **Step 2: Update public channel guidance**

Edit or add official guidance only for Rules, Choose Your Path, Announcements, Introductions, Domain Talk, Wins & Showcase, Domain Intelligence, Offers, Support, Events, RayFox Commands, and VIP Access.

- [x] **Step 3: Update private VIP guidance**

Edit or add official guidance only for VIP Lounge, VIP Opportunities, and VIP Support, without exposing their content or permissions publicly.

- [x] **Step 4: Verify browser state**

Refresh representative channels, confirm formatting and links render, confirm RayFox command permission remains restricted to the RayFox channel, and confirm member-authored messages were not changed.

### Task 3: Final verification

**Files:**
- Review all scoped repository and Discord changes.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: evidence-backed completion report.

- [x] **Step 1: Run quality gates**

Run: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

- [x] **Step 2: Inspect repository diff**

Run: `git diff --check` and `git status --short`. Preserve existing untracked audit and brand assets.

- [x] **Step 3: Report truthful limitations**

State that verification outcomes are live, command responses remain ephemeral, and renewal/VIP DMs await a real event source rather than seeded data.
