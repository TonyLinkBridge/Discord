import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, vi } from "vitest";
import { renderAdmin } from "@/test/render";
import { ConversionPerformance } from "./conversion-performance";

class ChartResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  disconnect() {}
  unobserve() {}

  observe(target: Element) {
    this.callback(
      [
        {
          borderBoxSize: [],
          contentBoxSize: [],
          contentRect: {
            bottom: 276,
            height: 276,
            left: 0,
            right: 700,
            toJSON: () => ({}),
            top: 0,
            width: 700,
            x: 0,
            y: 0,
          },
          devicePixelContentBoxSize: [],
          target,
        },
      ],
      this,
    );
  }
}

beforeAll(() => vi.stubGlobal("ResizeObserver", ChartResizeObserver));
afterAll(() => vi.unstubAllGlobals());

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

test("shows the reference date cadence, 20-unit scale, and every registration value", async () => {
  renderAdmin(<ConversionPerformance />);

  const chart = await screen.findByRole("img", {
    name: "Registrations line chart for Aug 16–22, 2026",
  });
  const visualChart = within(chart);

  expect(await visualChart.findByText("Aug 16")).toBeVisible();
  expect(visualChart.getByText("Sun")).toBeVisible();
  expect(visualChart.getAllByText("20")).toHaveLength(2);
  for (const tick of ["40", "60", "80", "100"]) {
    expect(visualChart.getByText(tick)).toBeVisible();
  }
  for (const value of ["9", "11", "15", "17", "12", "84"]) {
    expect(visualChart.getByText(value)).toBeVisible();
  }
});
