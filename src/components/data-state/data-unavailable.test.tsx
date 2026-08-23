import { screen } from "@testing-library/react";
import { createUnavailableTestAdminDataStore } from "@/test/admin-data";
import { renderAdmin } from "@/test/render";
import { CapabilityBoundary } from "./data-unavailable";

test("replaces unavailable capability content with an honest explanation", () => {
  renderAdmin(
    <CapabilityBoundary
      capability="read-members"
      description="Connect Discord member sync to use this page."
      title="Member data is not connected"
    >
      <p>Member directory</p>
    </CapabilityBoundary>,
    { provider: createUnavailableTestAdminDataStore() },
  );

  expect(screen.getByRole("heading", { name: "Member data is not connected" })).toBeVisible();
  expect(screen.getByText("Connect Discord member sync to use this page.")).toBeVisible();
  expect(screen.queryByText("Member directory")).not.toBeInTheDocument();
});
