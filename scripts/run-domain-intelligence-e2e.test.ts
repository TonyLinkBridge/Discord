// @vitest-environment node

import { EventEmitter } from "node:events";

import { expect, test, vi } from "vitest";

import {
  createDomainIntelligenceE2eEnvironment,
  domainIntelligenceE2ePorts,
  runDomainIntelligenceE2e,
  startDomainIntelligenceE2eServices,
} from "./run-domain-intelligence-e2e.mjs";
import { domainIntelligenceE2eFixture } from "./domain-intelligence-e2e-fixtures.mjs";

test("starts every dependency on fixed loopback ports with internal beta access", () => {
  const testUrl = "postgresql://test:secret@test-branch.neon.tech/neondb";
  const environment = createDomainIntelligenceE2eEnvironment({
    VERIFICATION_TEST_DATABASE_URL: testUrl,
    VERIFICATION_TEST_BRANCH_ID: "br-test-123",
    VERIFICATION_PRODUCTION_BRANCH_ID: "br-production-123",
  });

  expect(domainIntelligenceE2ePorts).toEqual({
    app: 3113,
    discord: 3114,
    rayName: 3115,
  });
  expect(environment).toMatchObject({
    DATABASE_URL: testUrl,
    DISCORD_API_BASE_URL: "http://127.0.0.1:3114",
    RAYNAME_COMMERCE_API_BASE_URL: "http://127.0.0.1:3115",
    RAYFOX_PUBLIC_BASE_URL: "http://127.0.0.1:3113",
    RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
    RAYFOX_DOMAIN_BETA_ROLE_IDS: [
      domainIntelligenceE2eFixture.normalBetaRoleId,
      domainIntelligenceE2eFixture.verifiedBetaRoleId,
    ].join(","),
    DISCORD_PUBLIC_KEY: domainIntelligenceE2eFixture.publicKey,
    NODE_ENV: "development",
  });
});

test("refuses to build an E2E environment without the designated test URL", () => {
  expect(() => createDomainIntelligenceE2eEnvironment({}))
    .toThrow("VERIFICATION_TEST_DATABASE_URL");
});

test("starts both loopback stubs and closes every process", async () => {
  const discord = { close: vi.fn().mockResolvedValue(undefined) };
  const rayName = { close: vi.fn().mockResolvedValue(undefined) };
  const child = Object.assign(new EventEmitter(), {
    killed: false,
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true;
      return true;
    }),
  });
  const startDiscord = vi.fn().mockResolvedValue(discord);
  const startRayName = vi.fn().mockResolvedValue(rayName);
  const spawn = vi.fn().mockReturnValue(child);
  const source = {
    VERIFICATION_TEST_DATABASE_URL:
      "postgresql://test:secret@test-branch.neon.tech/neondb",
  };

  const services = await startDomainIntelligenceE2eServices(source, {
    assertEnvironment: vi.fn().mockResolvedValue({}),
    startDiscord,
    startRayName,
    spawn,
  });

  expect(startDiscord).toHaveBeenCalledWith({ host: "127.0.0.1", port: 3114 });
  expect(startRayName).toHaveBeenCalledWith({ host: "127.0.0.1", port: 3115 });
  expect(spawn).toHaveBeenCalledWith(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3113"],
    expect.objectContaining({
      env: expect.objectContaining({
        RAYFOX_DOMAIN_INTELLIGENCE_MODE: "internal",
      }),
      stdio: "inherit",
    }),
  );

  await services.close("SIGTERM");
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(discord.close).toHaveBeenCalledOnce();
  expect(rayName.close).toHaveBeenCalledOnce();
});

test("runs only the domain Playwright journey with the explicit E2E marker", async () => {
  const child = new EventEmitter();
  const spawn = vi.fn().mockReturnValue(child);
  const source = {
    VERIFICATION_TEST_DATABASE_URL:
      "postgresql://test:secret@test-branch.neon.tech/neondb",
  };
  const resultPromise = runDomainIntelligenceE2e(source, {
    assertEnvironment: vi.fn().mockResolvedValue({}),
    spawn,
  });
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
  child.emit("exit", 0, null);

  await expect(resultPromise).resolves.toBe(0);
  expect(spawn).toHaveBeenCalledWith(
    "npm",
    ["run", "test:e2e", "--", "e2e/domain-intelligence.spec.ts"],
    {
      env: expect.objectContaining({ DOMAIN_INTELLIGENCE_E2E: "1" }),
      stdio: "inherit",
    },
  );
});

test("checks the disposable database before starting Playwright", async () => {
  const spawn = vi.fn();
  await expect(runDomainIntelligenceE2e({}, {
    assertEnvironment: vi.fn().mockRejectedValue(
      new Error("VERIFICATION_TEST_DATABASE_URL is required for verification E2E"),
    ),
    spawn,
  })).rejects.toThrow("VERIFICATION_TEST_DATABASE_URL");
  expect(spawn).not.toHaveBeenCalled();
});
