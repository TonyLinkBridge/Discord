import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderAdmin } from "@/test/render";
import { ConversionPerformance } from "./conversion-performance";

test("switches the accessible chart data from registrations to transfers", async () => {
  const user = userEvent.setup();
  renderAdmin(<ConversionPerformance />);

  expect(await screen.findByText("Registrations data table")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Registrations" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await user.click(screen.getByRole("tab", { name: "Transfers" }));

  expect(screen.getByText("Transfers data table")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "39" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Transfers" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
