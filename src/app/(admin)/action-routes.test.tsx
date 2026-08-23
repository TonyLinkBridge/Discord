import { screen } from "@testing-library/react";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { renderAdmin } from "@/test/render";
import CampaignsPage from "./campaigns/page";
import ContentPage from "./content/page";
import OffersPage from "./offers/page";

test("campaign route does not mount creation controls without campaign data", async () => {
  const page = await CampaignsPage({ searchParams: Promise.resolve({}) });
  renderAdmin(page, { provider: createUnavailableTestAdminDataStore() });
  expect(screen.getByRole("heading", { name: "Campaign data is not connected" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Create campaign" })).not.toBeInTheDocument();
});

test("offer route does not mount publishing controls without offer data", () => {
  renderAdmin(<OffersPage />, { provider: createUnavailableTestAdminDataStore() });
  expect(screen.getByRole("heading", { name: "Offer data is not connected" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save offer" })).not.toBeInTheDocument();
});

test("content route does not mount scheduling controls without content data", () => {
  renderAdmin(<ContentPage />, { provider: createUnavailableTestAdminDataStore() });
  expect(screen.getByRole("heading", { name: "Content data is not connected" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Schedule post" })).not.toBeInTheDocument();
});
