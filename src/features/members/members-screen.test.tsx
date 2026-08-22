import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import { localAdminSeed } from "@/lib/admin-data/seed";
import { renderAdmin } from "@/test/render";
import { MembersScreen } from "./members-screen";

test("filters unverified VIP signals and manually verifies one member", async () => {
  const user = userEvent.setup();
  const seed = structuredClone(localAdminSeed);
  seed.members[1] = {
    ...seed.members[1],
    customerStatus: "Prospect",
    roles: ["Flipper"],
    verified: false,
    vipSignal: "candidate",
  };
  const provider = createLocalAdminDataProvider(seed);

  renderAdmin(<MembersScreen />, { provider });
  await user.selectOptions(await screen.findByLabelText("Verification"), "unverified");
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
