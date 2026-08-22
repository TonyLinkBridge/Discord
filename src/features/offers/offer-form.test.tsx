import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { OfferForm } from "./offer-form";

test("extends and activates the .com Transfer Week offer", async () => {
  const user = userEvent.setup();
  const { provider } = renderAdmin(<OfferForm offerId="com-transfer-week" />);

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
