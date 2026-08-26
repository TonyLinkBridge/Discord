import { expect, test } from "@playwright/test";

import {
  createSignedDomainInteractionRequest,
  createSignedVerifyInteractionRequest,
  domainIntelligenceE2eFixture,
  readDomainIntelligenceE2eState,
  resetDomainIntelligenceE2e,
} from "../scripts/domain-intelligence-e2e-fixtures.mjs";

test.describe.configure({ mode: "serial" });

const discordBase = "http://127.0.0.1:3114";
const rayNameBase = "http://127.0.0.1:3115";
let interactionSequence = 0;

function nextInteractionId() {
  interactionSequence += 1;
  return `91${String(interactionSequence).padStart(16, "0")}`;
}

async function control(base: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(response.status).toBe(204);
}

async function reset() {
  await resetDomainIntelligenceE2e(process.env);
  await control(discordBase, "/__test/reset");
  await control(rayNameBase, "/__test/reset");
}

async function command(input: {
  member: "normal" | "verified";
  domain: string;
}) {
  const id = nextInteractionId();
  const response = await fetch(createSignedDomainInteractionRequest({
    interactionId: id,
    interactionToken: `private-${id}`,
    member: input.member,
    domain: input.domain,
  }));
  return { id, response, body: await response.json() };
}

async function edits() {
  const response = await fetch(`${discordBase}/__test/webhook-edits`);
  return (await response.json() as { edits: Array<{
    interactionAlias: string;
    message: Record<string, unknown>;
    status: number;
  }> }).edits;
}

async function waitForEdits(count: number) {
  await expect.poll(async () => (await edits()).length).toBe(count);
  return edits();
}

async function rayNameCalls() {
  const response = await fetch(`${rayNameBase}/__test/calls`);
  return (await response.json() as {
    calls: Array<{ method: string; path: string; status: number }>;
  }).calls;
}

test.beforeEach(async () => {
  await reset();
});

test("a normal member gets one private result, then the daily-limit card", async () => {
  const first = await command({ member: "normal", domain: "normal-one.ai" });
  expect(first.body).toEqual({ type: 5, data: { flags: 64 } });
  await waitForEdits(1);

  const second = await command({ member: "normal", domain: "normal-two.com" });
  expect(second.body).toEqual({ type: 5, data: { flags: 64 } });
  const messages = await waitForEdits(2);

  expect(JSON.stringify(messages[0]!.message)).toContain("**Available**");
  expect(JSON.stringify(messages[1]!.message)).toContain("Daily limit reached");
  expect((await rayNameCalls()).filter(({ path }) =>
    path.startsWith("/v1/domains/lookup"),
  )).toHaveLength(1);
});

test("a Verified member gets three results, then the daily-limit card", async () => {
  for (const domain of ["verified-one.ai", "verified-two.com", "verified-three.io"]) {
    const result = await command({ member: "verified", domain });
    expect(result.body).toEqual({ type: 5, data: { flags: 64 } });
  }
  await waitForEdits(3);
  const exhausted = await command({
    member: "verified",
    domain: "verified-four.net",
  });
  expect(exhausted.body).toEqual({ type: 5, data: { flags: 64 } });
  const messages = await waitForEdits(4);

  expect(JSON.stringify(messages[3]!.message)).toContain("Daily limit reached");
  const state = await readDomainIntelligenceE2eState(
    process.env,
    domainIntelligenceE2eFixture.verifiedUserId,
  );
  expect(state).toMatchObject({ succeeded: 3, quotaRejected: 1 });
});

for (const [mode, domain, cta, price] of [
  ["available", "available-card.ai", "Register on RayName", "USD 12.99"],
  ["registered", "registered-card.com", "Transfer to RayName", "USD 11.99"],
  ["premium", "premium-card.ai", "Register on RayName", "USD 1299.00"],
] as const) {
  test(`renders the ${mode} RayName CTA and price`, async () => {
    await control(rayNameBase, "/__test/mode", { mode });
    const result = await command({ member: "normal", domain });
    expect(result.body).toEqual({ type: 5, data: { flags: 64 } });
    const messages = await waitForEdits(1);
    const message = JSON.stringify(messages[0]!.message);

    expect(message).toContain(cta);
    expect(message).toContain(price);
    if (mode === "premium") expect(message).toContain("Premium domain");
  });
}

test("replays a five-minute repeat without another RayName request", async () => {
  await command({ member: "normal", domain: "fresh-replay.ai" });
  await waitForEdits(1);
  await command({ member: "normal", domain: "FRESH-REPLAY.AI" });
  const messages = await waitForEdits(2);

  expect(JSON.stringify(messages[1]!.message)).toContain("Fresh replay");
  expect((await rayNameCalls()).filter(({ path }) =>
    path.startsWith("/v1/domains/lookup"),
  )).toHaveLength(1);
});

test("a malformed RayName response does not consume the member allowance", async () => {
  await control(rayNameBase, "/__test/mode", { mode: "malformed" });
  await command({ member: "normal", domain: "malformed-first.ai" });
  let messages = await waitForEdits(1);
  expect(JSON.stringify(messages[0]!.message)).toContain("RayFox hit a snag");

  await control(rayNameBase, "/__test/mode", { mode: "available" });
  await command({ member: "normal", domain: "success-after-failure.ai" });
  messages = await waitForEdits(2);
  expect(JSON.stringify(messages[1]!.message)).toContain("**Available**");

  const state = await readDomainIntelligenceE2eState(
    process.env,
    domainIntelligenceE2eFixture.normalUserId,
  );
  expect(state).toMatchObject({ failed: 1, succeeded: 1, quotaRejected: 0 });
});

test("the existing verify command still returns its private modal", async () => {
  const id = nextInteractionId();
  const response = await fetch(createSignedVerifyInteractionRequest({
    interactionId: id,
    interactionToken: `private-${id}`,
    member: "normal",
  }));

  expect(await response.json()).toMatchObject({
    type: 9,
    data: {
      custom_id: "rayname_verify:v1",
      title: "Verify your RayName account",
    },
  });
});

test("the RayName CTA preserves safe attribution and records one click", async () => {
  await command({ member: "normal", domain: "attributed-click.ai" });
  const messages = await waitForEdits(1);
  const message = messages[0]!.message as {
    components?: Array<{ components: Array<{ label?: string; url?: string }> }>;
  };
  const cta = message.components
    ?.flatMap(({ components }) => components)
    .find(({ label }) => label === "Register on RayName")?.url;
  expect(cta).toBeTruthy();

  const first = await fetch(cta!, { redirect: "manual" });
  const second = await fetch(cta!, { redirect: "manual" });
  const destination = first.headers.get("location") ?? "";
  expect(first.status).toBe(302);
  expect(second.status).toBe(302);
  expect(destination).toContain("domain=attributed-click.ai");
  expect(destination).toContain("utm_source=discord");
  expect(destination).toContain("utm_medium=rayfox");
  expect(destination).toContain("utm_campaign=domain-intelligence");
  expect(destination).toContain("utm_content=register");
  expect(destination).not.toContain(domainIntelligenceE2eFixture.normalUserId);

  const state = await readDomainIntelligenceE2eState(
    process.env,
    domainIntelligenceE2eFixture.normalUserId,
  );
  expect(state.conversions).toBe(1);
});
