import { screen } from "@testing-library/react";
import { renderAdmin } from "@/test/render";
import OverviewPage from "./page";

test("mounts the Overview dashboard at the default admin route", async () => {
  renderAdmin(<OverviewPage />);

  expect(
    await screen.findByRole("heading", { name: "Conversion performance" }),
  ).toBeVisible();
});
