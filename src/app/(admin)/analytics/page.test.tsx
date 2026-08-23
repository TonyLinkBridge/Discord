import { screen } from "@testing-library/react";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { renderAdmin } from "@/test/render";
import AnalyticsPage from "./page";

test("analytics route does not mount reporting charts without live data", () => {
  renderAdmin(<AnalyticsPage />, { provider: createUnavailableTestAdminDataStore() });

  expect(screen.getByRole("heading", { name: "Analytics data is not connected" })).toBeVisible();
  expect(screen.queryByText("Provider-backed reporting")).not.toBeInTheDocument();
});
