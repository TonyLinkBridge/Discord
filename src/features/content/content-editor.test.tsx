import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderAdmin } from "@/test/render";
import { ContentEditor } from "./content-editor";
import { ContentScreen } from "./content-screen";

test("schedules a Domain Breakdown education post with one CTA", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<ContentEditor />);

  await user.type(screen.getByLabelText("Title"), "What makes a strong two-word .com");
  await user.selectOptions(screen.getByLabelText("Format"), "domain-breakdown");
  await user.selectOptions(screen.getByLabelText("Conversion level"), "education");
  await user.type(screen.getByLabelText("Publish date"), "2026-08-24");
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

  await user.click(screen.getByRole("button", { name: "Schedule post" }));

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Enter a title");
  expect(alert).toHaveTextContent("Select a format");
  expect(alert).toHaveTextContent("Select a conversion level");
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
