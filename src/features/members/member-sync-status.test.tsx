import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { MemberSyncViewStatus } from "@/lib/member-sync/types";

import { MemberSyncStatus } from "./member-sync-status";

const never: MemberSyncViewStatus = {
  state: "never",
  lastRunId: null,
  lastRunStatus: null,
  lastRunTrigger: null,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  lastSuccessfulSyncAt: null,
  safeErrorCode: null,
  safeErrorMessage: null,
};

function status(
  input: Partial<MemberSyncViewStatus> = {},
): MemberSyncViewStatus {
  return {
    ...never,
    state: "ready",
    lastRunId: "run-1",
    lastRunStatus: "succeeded",
    lastRunTrigger: "manual",
    lastRunStartedAt: "2026-08-24T04:59:00.000Z",
    lastRunCompletedAt: "2026-08-24T05:00:00.000Z",
    lastSuccessfulSyncAt: "2026-08-24T05:00:00.000Z",
    ...input,
  };
}

function renderStatus(
  syncStatus: MemberSyncViewStatus = never,
  syncAction = vi.fn().mockResolvedValue({ state: "idle" }),
) {
  render(
    <MemberSyncStatus
      activeMemberCount={41}
      botCount={1}
      currentTime={new Date().toISOString()}
      status={syncStatus}
      syncAction={syncAction}
    />,
  );
  return syncAction;
}

describe("member sync status control", () => {
  test("shows a truthful never-synced state and current zero-independent counts", () => {
    renderStatus();

    expect(screen.getByRole("heading", { name: "Discord member sync" })).toBeVisible();
    expect(screen.getByText("Never synced")).toBeVisible();
    expect(screen.getByText("41", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("1", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
  });

  test("renders the last successful sync as an accessible time", () => {
    renderStatus(status());

    const time = screen.getByText("Aug 24, 2026, 5:00 AM");
    expect(time).toHaveAttribute("datetime", "2026-08-24T05:00:00.000Z");
  });

  test("keeps stale facts visible with a safe degraded warning", () => {
    renderStatus(
      status({
        state: "degraded",
        lastRunStatus: "failed",
        lastRunCompletedAt: "2026-08-25T05:00:00.000Z",
        safeErrorCode: "rate_limited",
        safeErrorMessage: "Discord is rate limiting member synchronization",
      }),
    );

    expect(screen.getByText("41", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Discord is rate limiting member synchronization",
    );
  });

  test("disables the control while the server reports a running lease", () => {
    renderStatus(
      status({
        state: "running",
        lastRunStatus: "running",
        lastRunStartedAt: new Date().toISOString(),
        lastRunCompletedAt: null,
      }),
    );

    expect(screen.getByRole("button", { name: "Sync in progress" })).toBeDisabled();
  });

  test("allows an abandoned running lease to be recovered after 15 minutes", () => {
    renderStatus(
      status({
        state: "running",
        lastRunStatus: "running",
        lastRunStartedAt: "2020-01-01T00:00:00.000Z",
        lastRunCompletedAt: null,
      }),
    );

    expect(screen.getByRole("button", { name: "Recover sync" })).toBeEnabled();
  });

  test("does not claim stale data exists after the first-ever failed sync", () => {
    renderStatus({
      ...never,
      state: "degraded",
      lastRunId: "run-first",
      lastRunStatus: "failed",
      lastRunTrigger: "manual",
      lastRunStartedAt: "2026-08-24T05:00:00.000Z",
      lastRunCompletedAt: "2026-08-24T05:01:00.000Z",
      safeErrorCode: "members_intent_required",
      safeErrorMessage: "Enable Server Members Intent for RayFox",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No successful member snapshot is available",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "last successful data remains available",
    );
  });

  test("disables and labels the button while a manual action is pending", async () => {
    const user = userEvent.setup();
    let finish!: (value: { state: "succeeded"; memberCount: number; completedAt: string }) => void;
    const syncAction = vi.fn(
      () =>
        new Promise<{ state: "succeeded"; memberCount: number; completedAt: string }>(
          (resolve) => {
            finish = resolve;
          },
        ),
    );
    renderStatus(status(), syncAction);

    await user.click(screen.getByRole("button", { name: "Sync now" }));

    expect(screen.getByRole("button", { name: "Syncing" })).toBeDisabled();
    finish({
      state: "succeeded",
      memberCount: 42,
      completedAt: "2026-08-24T05:01:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Synced 42 members");
  });

  test("supports keyboard activation and announces a safe failure", async () => {
    const user = userEvent.setup();
    const syncAction = vi.fn().mockResolvedValue({
      state: "failed",
      message: "Discord is temporarily unavailable",
      retryable: true,
    });
    renderStatus(status(), syncAction);

    await user.tab();
    expect(screen.getByRole("button", { name: "Sync now" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Discord is temporarily unavailable",
    );
    expect(document.body).not.toHaveTextContent("bot-token");
    expect(document.body).not.toHaveTextContent("raw Discord response");
  });
});
