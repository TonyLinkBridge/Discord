import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { VerificationReviewRow } from "@/lib/verification/types";

import { VerificationQueue } from "./verification-queue";

const pending: VerificationReviewRow = {
  id: "72345678-1234-4234-8234-123456789012",
  discordUserId: "223456789012345678",
  displayName: "DomainNomad",
  discordHandle: "domain.nomad",
  email: "owner@example.com",
  domain: "example.com",
  status: "pending",
  createdAt: "2026-08-23T00:00:00.000Z",
  reviewedAt: null,
  roleAssignedAt: null,
  safeFailure: null,
};

function renderQueue(rows: VerificationReviewRow[]) {
  const actions = {
    approve: vi.fn().mockResolvedValue({ ok: true, status: "approved", message: "Assigned" }),
    reject: vi.fn().mockResolvedValue({ ok: true, status: "rejected", message: "Rejected" }),
    retry: vi.fn().mockResolvedValue({ ok: true, status: "approved", message: "Assigned" }),
  };
  render(<VerificationQueue actions={actions} rows={rows} />);
  return actions;
}

describe("VerificationQueue", () => {
  test("renders an honest connected-empty state", () => {
    renderQueue([]);

    expect(screen.getByText("No verification requests yet")).toBeVisible();
    expect(screen.queryByText("DomainNomad")).not.toBeInTheDocument();
  });

  test("shows decrypted applicant data only inside the review dialog", async () => {
    const user = userEvent.setup();
    renderQueue([pending]);

    expect(screen.getByText("DomainNomad")).toBeVisible();
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
    const opener = screen.getByRole("button", { name: "Review DomainNomad" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Review DomainNomad" });
    expect(within(dialog).getByText("owner@example.com")).toBeVisible();
    expect(within(dialog).getByText("example.com")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Close review" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("approves with a disabled pending button and announces the result", async () => {
    let finish!: (value: { ok: true; status: string; message: string }) => void;
    const approve = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(
      <VerificationQueue
        actions={{
          approve,
          reject: vi.fn(),
          retry: vi.fn(),
        }}
        rows={[pending]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Review DomainNomad" }));
    const button = screen.getByRole("button", {
      name: "Approve and assign Verified Customer",
    });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Approving DomainNomad");
    finish({ ok: true, status: "approved", message: "Assigned" });
    expect(await screen.findByRole("status")).toHaveTextContent("Assigned");
  });

  test("requires a rejection reason before calling the action", async () => {
    const actions = renderQueue([pending]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review DomainNomad" }));
    await user.click(screen.getByRole("button", { name: "Reject request" }));

    expect(actions.reject).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Enter a rejection reason");

    await user.type(screen.getByLabelText("Rejection reason"), "Account details did not match");
    await user.click(screen.getByRole("button", { name: "Reject request" }));
    expect(actions.reject).toHaveBeenCalledWith(
      pending.id,
      "Account details did not match",
    );
  });

  test("offers Retry only for role_failed and no mutation for resolved rows", async () => {
    const rows: VerificationReviewRow[] = [
      {
        ...pending,
        id: "82345678-1234-4234-8234-123456789012",
        status: "role_failed",
        safeFailure: "Move the bot role above Verified Customer",
      },
      { ...pending, id: "92345678-1234-4234-8234-123456789012", displayName: "Approved User", status: "approved" },
      { ...pending, id: "a2345678-1234-4234-8234-123456789012", displayName: "Rejected User", status: "rejected" },
    ];
    const user = userEvent.setup();
    renderQueue(rows);

    await user.click(screen.getByRole("button", { name: "Review DomainNomad" }));
    expect(screen.getByRole("button", { name: "Retry role assignment" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve and assign Verified Customer" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Review Approved User" }));
    const resolvedDialog = screen.getByRole("dialog", { name: "Review Approved User" });
    expect(
      within(resolvedDialog).queryByRole("button", {
        name: /^(Approve and assign Verified Customer|Reject request|Retry role assignment)$/,
      }),
    ).not.toBeInTheDocument();
  });
});
