import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderAdmin } from "@/test/render";
import { OfferForm } from "./offer-form";

test("extends and activates the .com Transfer Week offer", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
  try {
    const user = userEvent.setup();
    const { provider } = renderAdmin(
      <OfferForm offerId="com-transfer-week" today="2026-08-22" />,
    );

    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-08-30");
    await user.selectOptions(screen.getByLabelText("Status"), "active");
    await user.click(screen.getByRole("button", { name: "Save offer" }));

    expect(await screen.findByText("Live")).toBeVisible();
    expect(screen.getByText("Aug 17–30, 2026")).toBeVisible();
    expect(await provider.getOffer("com-transfer-offer")).toMatchObject({
      endsAt: "2026-08-30T23:59:59Z",
      status: "active",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Offer saved and live");
  } finally {
    vi.useRealTimers();
  }
});

test("exposes every approved offer lifecycle state", async () => {
  renderAdmin(<OfferForm offerId="com-transfer-offer" />);

  const status = screen.getByLabelText("Status");
  expect(within(status).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual([
    "draft",
    "scheduled",
    "active",
    "expired",
  ]);
});

test("campaign alias and offer ID preserve the same canonical start date", async () => {
  const aliasView = renderAdmin(<OfferForm offerId="com-transfer-week" />);
  const aliasStart = await screen.findByLabelText("Start date");
  expect(aliasStart).toHaveValue("2026-08-17");
  aliasView.unmount();

  renderAdmin(<OfferForm offerId="com-transfer-offer" />, { provider: aliasView.provider });
  const realStart = await screen.findByLabelText("Start date");
  expect(realStart).toHaveValue("2026-08-17");
  expect(await aliasView.provider.getOffer("com-transfer-offer")).toMatchObject({
    startsAt: "2026-08-17T00:00:00Z",
  });
});

test("rejects an external offer destination and focuses it", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" />);
  const destination = await screen.findByLabelText("Destination");

  await user.clear(destination);
  await user.type(destination, "https://example.com/transfer");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use an HTTPS RayName destination");
  expect(destination).toHaveFocus();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({
    destination: "https://www.rayname.com/domain/transfer",
  });
});

test("rejects a credential-bearing RayName offer destination", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" />);
  const destination = await screen.findByLabelText("Destination");

  await user.clear(destination);
  await user.type(destination, "https://attacker:secret@www.rayname.com/domain/transfer");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Use an HTTPS RayName destination without credentials");
  expect(destination).toHaveFocus();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({
    destination: "https://www.rayname.com/domain/transfer",
  });
});

test("rejects an offer end date before its start date", async () => {
  const user = userEvent.setup();
  renderAdmin(<OfferForm offerId="com-transfer-offer" />);
  const startDate = await screen.findByLabelText("Start date");
  const endDate = screen.getByLabelText("End date");

  await user.clear(startDate);
  await user.type(startDate, "2026-09-01");
  await user.clear(endDate);
  await user.type(endDate, "2026-08-30");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(screen.getByRole("alert")).toHaveTextContent("End date cannot be earlier than start date");
  expect(endDate).toHaveFocus();
});

test("derives Scheduled when a non-draft offer starts after today", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" today="2026-08-22" />);
  const startDate = await screen.findByLabelText("Start date");
  const endDate = screen.getByLabelText("End date");

  await user.clear(startDate);
  await user.type(startDate, "2026-08-23");
  await user.clear(endDate);
  await user.type(endDate, "2026-08-30");
  await user.selectOptions(screen.getByLabelText("Status"), "active");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(await screen.findByText("Scheduled", { selector: "span" })).toBeVisible();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({ status: "scheduled" });
});

test("derives Expired when a non-draft offer ended before today", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" today="2026-08-22" />);
  const startDate = await screen.findByLabelText("Start date");
  const endDate = screen.getByLabelText("End date");

  await user.clear(startDate);
  await user.type(startDate, "2026-08-01");
  await user.clear(endDate);
  await user.type(endDate, "2026-08-21");
  await user.selectOptions(screen.getByLabelText("Status"), "active");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(await screen.findByText("Expired", { selector: "span" })).toBeVisible();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({ status: "expired" });
});

test("derives Live on inclusive validity boundaries despite a contradictory schedule", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" today="2026-08-22" />);
  const startDate = await screen.findByLabelText("Start date");
  const endDate = screen.getByLabelText("End date");

  await user.clear(startDate);
  await user.type(startDate, "2026-08-22");
  await user.clear(endDate);
  await user.type(endDate, "2026-08-22");
  await user.selectOptions(screen.getByLabelText("Status"), "scheduled");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(await screen.findByText("Live")).toBeVisible();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({ status: "active" });
});

test("keeps Draft as an explicit unpublished lifecycle state", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-offer" today="2026-08-22" />);
  await screen.findByLabelText("Start date");
  await user.selectOptions(screen.getByLabelText("Status"), "draft");
  await user.click(screen.getByRole("button", { name: "Save offer" }));

  expect(await screen.findByText("Draft", { selector: "span" })).toBeVisible();
  expect(await provider.getOffer("com-transfer-offer")).toMatchObject({ status: "draft" });
});
