import { screen } from "@testing-library/react";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { renderAdmin } from "@/test/render";
import CommunityPage from "./community/page";
import LeadsPage from "./leads/page";
import MembersPage from "./members/page";

test("community route does not mount sample community data without a connection", () => {
  renderAdmin(<CommunityPage />, { provider: createUnavailableTestAdminDataStore() });

  expect(screen.getByRole("heading", { name: "Community data is not connected" })).toBeVisible();
  expect(screen.queryByText("1,248")).not.toBeInTheDocument();
});

test("member route does not mount sample members without a connection", async () => {
  const page = await MembersPage({ searchParams: Promise.resolve({}) });
  renderAdmin(page, { provider: createUnavailableTestAdminDataStore() });

  expect(screen.getByRole("heading", { name: "Member data is not connected" })).toBeVisible();
  expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
});

test("lead route does not mount sample leads without a connection", async () => {
  const page = await LeadsPage({ searchParams: Promise.resolve({}) });
  renderAdmin(page, { provider: createUnavailableTestAdminDataStore() });

  expect(screen.getByRole("heading", { name: "Lead data is not connected" })).toBeVisible();
  expect(screen.queryByText("DomainNomad")).not.toBeInTheDocument();
});
