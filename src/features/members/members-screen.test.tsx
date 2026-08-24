import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import type { MemberDirectoryRow } from "@/lib/member-sync/read-model";
import { renderAdmin } from "@/test/render";

import { MembersScreen } from "./members-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const members: MemberDirectoryRow[] = [
  {
    id: "223456789012345678",
    displayName: "Alex Chen",
    discordHandle: "@alex.chen",
    avatarUrl: null,
    membershipStatus: "active",
    verified: true,
    roles: ["Verified Customer", "Investor"],
    joinedAt: "2026-08-20T00:00:00.000Z",
    lastSeenAt: "2026-08-24T05:00:00.000Z",
    isBot: false,
  },
  {
    id: "223456789012345679",
    displayName: "DomainNomad",
    discordHandle: "@domain.nomad",
    avatarUrl: null,
    membershipStatus: "left",
    verified: false,
    roles: ["Flipper"],
    joinedAt: null,
    lastSeenAt: "2026-08-23T05:00:00.000Z",
    isBot: false,
  },
  {
    id: "223456789012345680",
    displayName: "RayFox",
    discordHandle: "@rayfox",
    avatarUrl: null,
    membershipStatus: "active",
    verified: false,
    roles: ["RayName Bot"],
    joinedAt: "2026-08-19T00:00:00.000Z",
    lastSeenAt: "2026-08-24T05:00:00.000Z",
    isBot: true,
  },
];

test("renders only truthful Discord member columns and filters", () => {
  renderAdmin(<MembersScreen members={members} />);

  for (const header of [
    "Discord identity",
    "Membership",
    "Verification",
    "Roles",
    "Joined",
    "Last snapshot",
  ]) {
    expect(screen.getByRole("columnheader", { name: header })).toBeVisible();
  }
  for (const oldField of [
    "Segment",
    "Registration source",
    "Customer status",
    "VIP signal",
    "Last activity",
  ]) {
    expect(screen.queryByRole("columnheader", { name: oldField })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(oldField)).not.toBeInTheDocument();
  }
  expect(screen.getByLabelText("Membership")).toBeVisible();
  expect(screen.getByLabelText("Verification")).toBeVisible();
  expect(screen.getByLabelText("Role")).toBeVisible();
  expect(screen.getByLabelText("Account type")).toBeVisible();
});

test("filters by membership, verification, role, account type, and search", async () => {
  const user = userEvent.setup();
  renderAdmin(<MembersScreen members={members} />);

  await user.selectOptions(screen.getByLabelText("Membership"), "left");
  expect(screen.getByText("DomainNomad")).toBeVisible();
  expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Membership"), "all");
  await user.selectOptions(screen.getByLabelText("Verification"), "verified");
  expect(screen.getByText("Alex Chen")).toBeVisible();
  expect(screen.queryByText("DomainNomad")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Verification"), "all");
  await user.selectOptions(screen.getByLabelText("Role"), "Flipper");
  expect(screen.getByText("DomainNomad")).toBeVisible();
  expect(screen.queryByText("RayFox")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Role"), "all");
  await user.selectOptions(screen.getByLabelText("Account type"), "bot");
  expect(screen.getByText("RayFox")).toBeVisible();
  expect(screen.queryByText("DomainNomad")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Account type"), "all");
  await user.type(screen.getByRole("searchbox", { name: "Search members" }), "domain.nomad");
  expect(screen.getByText("DomainNomad")).toBeVisible();
  expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
});

test("opens a query-selected read-only Discord member detail", () => {
  renderAdmin(
    <MembersScreen
      initialSelectedMemberId="223456789012345678"
      members={members}
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Alex Chen" });
  expect(within(dialog).getByText("Verified Customer")).toBeVisible();
  expect(within(dialog).getByText("Member", { selector: "dd" })).toBeVisible();
  expect(within(dialog).queryByRole("button", { name: "Verify customer" }))
    .not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Assign role" }))
    .not.toBeInTheDocument();
  expect(within(dialog).queryByRole("textbox", { name: "Internal note" }))
    .not.toBeInTheDocument();
});

test("resets detail when a query-selected Discord ID changes", async () => {
  const user = userEvent.setup();
  function Harness() {
    const [memberId, setMemberId] = useState<string | null>(null);
    return (
      <>
        <button onClick={() => setMemberId(members[0].id)} type="button">Select Alex</button>
        <button onClick={() => setMemberId(members[1].id)} type="button">Select DomainNomad</button>
        <MembersScreen initialSelectedMemberId={memberId} members={members} />
      </>
    );
  }
  renderAdmin(<Harness />);

  await user.click(screen.getByRole("button", { name: "Select Alex" }));
  expect(screen.getByRole("dialog", { name: "Alex Chen" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Select DomainNomad" }));
  expect(screen.getByRole("dialog", { name: "DomainNomad" })).toBeVisible();
});

test("closes the member dialog on Escape and restores focus to its opener", async () => {
  const user = userEvent.setup();
  renderAdmin(<MembersScreen members={members} />);

  const opener = screen.getByRole("button", { name: "Open DomainNomad" });
  await user.click(opener);
  expect(screen.getByRole("button", { name: "Close member details" })).toHaveFocus();
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test("shows a connected-empty member directory", () => {
  renderAdmin(<MembersScreen members={[]} />);

  expect(screen.getByText("No members yet")).toBeVisible();
  expect(screen.queryByText("Data source not connected")).not.toBeInTheDocument();
});
