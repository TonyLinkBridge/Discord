import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { renderAdmin } from "@/test/render";
import { MembersScreen } from "./members-screen";

test("opens a requested member in the canonical member workflow", async () => {
  renderAdmin(<MembersScreen initialSelectedMemberId="alex-chen" />);

  expect(await screen.findByRole("dialog", { name: "Alex Chen" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Member directory" })).toBeVisible();
});

test("filters unverified VIP signals and manually verifies one member", async () => {
  const user = userEvent.setup();
  const backingProvider = createLocalAdminDataProvider();
  let verificationCalls = 0;
  const provider = {
    ...backingProvider,
    async verifyMember(memberId: string, actorId: string) {
      verificationCalls += 1;
      return backingProvider.verifyMember(memberId, actorId);
    },
  };
  renderAdmin(<MembersScreen />, { provider });
  const verificationFilter = await screen.findByLabelText("Verification");
  await user.selectOptions(verificationFilter, "unverified");
  await user.selectOptions(screen.getByLabelText("VIP signal"), "candidate");

  expect(await screen.findByText("DomainNomad")).toBeVisible();
  expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Open DomainNomad" }));
  await user.click(screen.getByRole("button", { name: "Verify customer" }));

  expect(screen.getByRole("status")).toHaveTextContent("Customer verified manually");
  expect(await provider.getMember("domainnomad")).toMatchObject({
    customerStatus: "Verified customer",
    roles: ["Flipper", "Verified"],
    verified: true,
  });
  expect((await provider.getActivity())[0]).toMatchObject({
    action: "member.updated",
    actorId: "local-ray",
    entityId: "domainnomad",
  });
  expect(verificationCalls).toBe(1);
  expect(screen.queryByRole("button", { name: "Open DomainNomad" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Close member details" }));

  expect(verificationFilter).toHaveFocus();
});

test("keeps the Verified role exclusive to the complete verification transition", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<MembersScreen />);

  await user.click(await screen.findByRole("button", { name: "Open DomainNomad" }));
  const roleSelect = screen.getByLabelText("Role to assign");

  expect(within(roleSelect).queryByRole("option", { name: "Verified" })).not.toBeInTheDocument();

  await user.selectOptions(roleSelect, "VIP");
  await user.click(screen.getByRole("button", { name: "Assign role" }));

  expect(await provider.getMember("domainnomad")).toMatchObject({
    roles: ["Flipper", "VIP"],
    verified: false,
  });
  expect((await provider.getMember("domainnomad")).roles).not.toContain("Verified");
});

test("moves focus into the member dialog and traps both Tab boundaries", async () => {
  const user = userEvent.setup();
  renderAdmin(<MembersScreen />);

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  const dialog = screen.getByRole("dialog", { name: "Alex Chen" });
  const closeButton = within(dialog).getByRole("button", { name: "Close member details" });
  const lastButton = within(dialog).getByRole("button", { name: "Create tracked link" });

  expect(closeButton).toHaveFocus();
  await user.tab({ shift: true });
  expect(lastButton).toHaveFocus();
  await user.tab();
  expect(closeButton).toHaveFocus();
});

test("closes the member dialog on Escape and restores focus to its opener", async () => {
  const user = userEvent.setup();
  renderAdmin(<MembersScreen />);

  const opener = await screen.findByRole("button", { name: "Open DomainNomad" });
  await user.click(opener);
  expect(screen.getByRole("button", { name: "Close member details" })).toHaveFocus();

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test("runs the approved member operations and persists their outcomes", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<MembersScreen />);

  await user.click(await screen.findByRole("button", { name: "Open Alex Chen" }));
  await user.selectOptions(screen.getByLabelText("Role to assign"), "VIP");
  await user.click(screen.getByRole("button", { name: "Assign role" }));
  await user.click(screen.getByRole("button", { name: "Review VIP" }));
  await user.click(screen.getByRole("button", { name: "Open private support ticket" }));
  await user.type(screen.getByRole("textbox", { name: "Internal note" }), "Requested transfer concierge follow-up");
  await user.click(screen.getByRole("button", { name: "Add internal note" }));
  await user.click(screen.getByRole("button", { name: "Create tracked link" }));

  expect(
    (screen.getByRole("textbox", { name: "Tracked RayName URL" }) as HTMLInputElement).value,
  ).toMatch(/utm_content=member-alex-chen/);
  await user.click(screen.getByRole("button", { name: "Copy tracked link" }));
  expect(screen.getByRole("status")).toHaveTextContent("Tracked RayName link copied");
  expect(await provider.getMember("alex-chen")).toMatchObject({
    roles: ["Investor", "Verified", "VIP"],
    notes: [
      "Interested in .com portfolio transfers",
      "Requested transfer concierge follow-up",
    ],
  });
  expect((await provider.getState()).trackedLinks[0].url).toContain(
    "utm_campaign=member-outreach",
  );
  expect((await provider.getActivity()).slice(0, 5).map((event) => event.action)).toEqual([
    "tracking.link.created",
    "member.updated",
    "member.open-ticket",
    "member.review-vip",
    "member.updated",
  ]);
});
