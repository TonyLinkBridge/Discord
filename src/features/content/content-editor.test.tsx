import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { createLocalAdminDataProvider } from "@/lib/admin-data/local-provider";
import type { AdminDataProvider } from "@/lib/admin-data/provider";
import { localAdminSeed } from "@/lib/admin-data/seed";
import type { AdminState, ContentEntry } from "@/lib/admin-data/types";
import { renderAdmin } from "@/test/render";
import { ContentEditor } from "./content-editor";
import { ContentScreen } from "./content-screen";

test("schedules a Domain Breakdown education post with one CTA", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);

  await user.selectOptions(
    await screen.findByLabelText("Post slot to replace"),
    "market-pulse-aug-22",
  );
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "What makes a strong two-word .com");
  await user.selectOptions(screen.getByLabelText("Format"), "domain-breakdown");
  await user.selectOptions(screen.getByLabelText("Conversion level"), "education");
  await user.clear(screen.getByLabelText("Publish date"));
  await user.type(screen.getByLabelText("Publish date"), "2026-08-24");
  await user.clear(screen.getByLabelText("CTA"));
  await user.type(screen.getByLabelText("CTA"), "Search similar names");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(await screen.findByText("What makes a strong two-word .com")).toBeVisible();
  expect(screen.getByText("Aug 24, 2026")).toBeVisible();
  expect(screen.getByText("4:2:1 cycle compliant")).toBeVisible();
  expect(screen.getAllByLabelText("CTA")).toHaveLength(1);
  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    ctas: ["Search similar names"],
    conversionLevel: "education",
    format: "domain-breakdown",
    publishAt: "2026-08-24T13:00:00Z",
    status: "scheduled",
    title: "What makes a strong two-word .com",
  });
  expect((await provider.getActivity())[0]).toMatchObject({
    action: "content.updated",
    actorId: "local-ray",
    entityId: "market-pulse-aug-22",
  });
  expect(screen.getByRole("status")).toHaveTextContent("Post scheduled");
});

test("sorts slots independently of provider order and discloses the selected replacement", async () => {
  const user = userEvent.setup();
  const reorderedSeed: AdminState = structuredClone(localAdminSeed);
  reorderedSeed.content.reverse();
  const provider = createLocalAdminDataProvider(reorderedSeed);
  renderAdmin(<ContentEditor />, { provider });

  const target = await screen.findByLabelText("Post slot to replace");
  const options = within(target).getAllByRole("option");
  expect(options[1]).toHaveValue("market-pulse-aug-22");
  expect(options[1]).toHaveTextContent(
    "Cycle 1 · Slot 1 · Aug 22, 2026 · Market Pulse: .com transfer signals",
  );

  await user.selectOptions(target, "market-pulse-aug-22");
  expect(screen.getByText(/Saving will overwrite this existing post/)).toHaveTextContent(
    "Cycle 1, slot 1",
  );
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Reordered provider update");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    title: "Reordered provider update",
  });
  expect(await provider.getContentEntry("market-pulse-aug-28")).toMatchObject({
    title: "Friday .com transfer offer",
  });
});

test("offers scheduled slots only and leaves published and draft records unchanged", async () => {
  const user = userEvent.setup();
  const mixedStatusSeed: AdminState = structuredClone(localAdminSeed);
  mixedStatusSeed.content = mixedStatusSeed.content.map((entry, index) => ({
    ...entry,
    status: index === 0 ? "scheduled" : index % 2 ? "published" : "draft",
  }));
  const provider = createLocalAdminDataProvider(mixedStatusSeed);
  renderAdmin(<ContentEditor />, { provider });

  const target = await screen.findByLabelText("Post slot to replace");
  expect(within(target).getAllByRole("option").map((option) => option.getAttribute("value")))
    .toEqual(["", "market-pulse-aug-22"]);

  await user.selectOptions(target, "market-pulse-aug-22");
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Eligible scheduled replacement");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    status: "scheduled",
    title: "Eligible scheduled replacement",
  });
  expect(await provider.getContentEntry("domain-101-aug-23")).toMatchObject({
    status: "published",
    title: "Domain 101: preparing a transfer",
  });
  expect(await provider.getContentEntry("name-battle-aug-24")).toMatchObject({
    status: "draft",
    title: "Name Battle: exact match or brandable",
  });
  expect((await provider.getActivity()).map((event) => event.entityId))
    .toEqual(["market-pulse-aug-22"]);
});

test("rechecks eligibility before writing a slot that became published", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);
  const target = await screen.findByLabelText("Post slot to replace");
  await user.selectOptions(target, "market-pulse-aug-22");
  await provider.updateContentEntry(
    "market-pulse-aug-22",
    { status: "published", title: "Published historical post" },
    "publisher",
  );

  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Attempted overwrite");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only scheduled posts can be replaced. Choose another slot",
  );
  expect(target).toHaveFocus();
  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    status: "published",
    title: "Published historical post",
  });
  expect((await provider.getActivity()).map((event) => event.actorId)).toEqual(["publisher"]);
});

test("explains and disables scheduling when no eligible slots exist", async () => {
  const noEligibleSeed: AdminState = structuredClone(localAdminSeed);
  noEligibleSeed.content = noEligibleSeed.content.map((entry, index) => ({
    ...entry,
    status: index % 2 ? "published" : "draft",
  }));
  const provider = createLocalAdminDataProvider(noEligibleSeed);
  renderAdmin(<ContentEditor />, { provider });

  const target = await screen.findByLabelText("Post slot to replace");
  expect(target).toBeDisabled();
  expect(within(target).getAllByRole("option").map((option) => option.getAttribute("value")))
    .toEqual([""]);
  expect(target).toHaveAccessibleDescription(
    "No scheduled post slots are available. Published and draft posts cannot be replaced here.",
  );
  expect(screen.getByRole("button", { name: "Schedule post" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("No eligible replacement targets");
  expect(await provider.getActivity()).toHaveLength(0);
});

test("requires a disclosed target and focuses the slot selector", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);

  await screen.findByLabelText("Post slot to replace");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Choose a post slot to replace");
  expect(screen.getByLabelText("Post slot to replace")).toHaveFocus();
  expect(screen.getByLabelText("Post slot to replace")).toHaveAccessibleDescription(
    "Choose a post slot to replace",
  );
  expect((await provider.getActivity())).toHaveLength(0);
});

test("supports repeated updates to the same explicitly selected slot", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);
  await user.selectOptions(
    await screen.findByLabelText("Post slot to replace"),
    "market-pulse-aug-22",
  );

  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, "First replacement");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Post scheduled");

  await user.clear(title);
  await user.type(title, "Second replacement");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    title: "Second replacement",
  });
  expect((await provider.getActivity()).filter((event) => event.entityId === "market-pulse-aug-22"))
    .toHaveLength(2);
});

test("offers only the six approved Domain Intelligence formats", () => {
  renderAdmin(<ContentEditor />);

  const options = within(screen.getByLabelText("Format")).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual([
    "Select a format",
    "Market Pulse",
    "Domain 101",
    "Name Battle",
    "Domain Breakdown",
    "Risk Check",
    "Brand Launch",
  ]);
  expect(options.map((option) => option.getAttribute("value"))).toEqual([
    "",
    "market-pulse",
    "domain-101",
    "name-battle",
    "domain-breakdown",
    "risk-check",
    "brand-launch",
  ]);
});

test("reports invalid scheduling fields and focuses the first error", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);

  await user.selectOptions(
    await screen.findByLabelText("Post slot to replace"),
    "market-pulse-aug-22",
  );
  await user.clear(screen.getByLabelText("Title"));
  await user.clear(screen.getByLabelText("Publish date"));
  await user.clear(screen.getByLabelText("CTA"));
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Enter a title");
  expect(alert).toHaveTextContent("Enter a publish date");
  expect(alert).toHaveTextContent("Each post must have exactly one CTA");
  expect(screen.getByLabelText("Title")).toHaveFocus();
  expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("Enter a title");
  expect(screen.getByLabelText("CTA")).toHaveAccessibleDescription(
    "Each post must have exactly one CTA",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Post has validation errors");
  expect(await provider.getContentEntry("market-pulse-aug-22")).toMatchObject({
    title: "Market Pulse: .com transfer signals",
  });
});

test("loads the provider-backed seven-post calendar and its literal mix", async () => {
  renderAdmin(<ContentScreen />);

  expect(await screen.findByRole("heading", { name: "Content calendar" })).toBeVisible();
  expect(screen.getByText("4 education")).toBeVisible();
  expect(screen.getByText("2 soft conversion")).toBeVisible();
  expect(screen.getByText("1 direct offer")).toBeVisible();
  expect(screen.getByText("4:2:1 cycle compliant")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(7);
});

test("reports compliance per selected cycle and identifies an incomplete cycle", async () => {
  const user = userEvent.setup();
  const multiCycleSeed: AdminState = structuredClone(localAdminSeed);
  const secondCycle = multiCycleSeed.content.map((item, index): ContentEntry => ({
    ...item,
    id: `${item.id}-cycle-2`,
    publishAt: `2026-09-${String(index + 1).padStart(2, "0")}T13:00:00Z`,
  }));
  multiCycleSeed.content = [...multiCycleSeed.content, ...secondCycle];
  const provider = createLocalAdminDataProvider(multiCycleSeed);
  const multiCycleView = renderAdmin(<ContentScreen />, { provider });

  const cycle = await screen.findByLabelText("Publishing cycle");
  expect(screen.getByText("4:2:1 cycle compliant")).toBeVisible();
  await user.selectOptions(cycle, "1");
  expect(screen.getByText("Cycle 2 · Sep 1–7, 2026")).toBeVisible();
  expect(screen.getByText("4:2:1 cycle compliant")).toBeVisible();
  multiCycleView.unmount();

  const incompleteSeed: AdminState = structuredClone(localAdminSeed);
  incompleteSeed.content.push({
    ...incompleteSeed.content[0],
    id: "incomplete-cycle-post",
    publishAt: "2026-09-01T13:00:00Z",
  });
  const incompleteView = renderAdmin(<ContentScreen />, {
    provider: createLocalAdminDataProvider(incompleteSeed),
  });
  await user.selectOptions(await screen.findByLabelText("Publishing cycle"), "1");
  expect(screen.getByText("Incomplete cycle · 1 of 7 posts")).toBeVisible();
  expect(screen.getByText("4:2:1 cycle needs adjustment")).toBeVisible();
  incompleteView.unmount();
});

test("refreshes the calendar from provider state after an editor update", async () => {
  const user = userEvent.setup();
  const baseProvider = createLocalAdminDataProvider();
  const provider: AdminDataProvider = {
    ...baseProvider,
    async updateContentEntry(entryId, patch, actorId) {
      const updated = await baseProvider.updateContentEntry(entryId, patch, actorId);
      await baseProvider.updateContentEntry(
        "domain-101-aug-23",
        { title: "Provider refresh marker" },
        actorId,
      );
      return updated;
    },
  };
  renderAdmin(<ContentScreen />, { provider });

  await user.selectOptions(
    await screen.findByLabelText("Post slot to replace"),
    "market-pulse-aug-22",
  );
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Updated primary slot");
  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  const calendar = screen.getByRole("heading", { name: "Content calendar" }).closest("section");
  expect(calendar).not.toBeNull();
  expect(await within(calendar as HTMLElement).findByText("Provider refresh marker")).toBeVisible();
  expect(within(calendar as HTMLElement).getByText("Updated primary slot")).toBeVisible();
});
