import { render, screen } from "@testing-library/react";
import OverviewPage from "./page";

test("shows the RayName admin entry point", () => {
  render(<OverviewPage />);
  expect(screen.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(screen.getByText("RayName Admin")).toBeVisible();
});
