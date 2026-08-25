import { expect, test } from "vitest";

import { usageDayAt } from "./time";

test("changes usage day at Kuala Lumpur midnight", () => {
  expect(usageDayAt(new Date("2026-08-24T15:59:59.999Z"))).toBe(
    "2026-08-24",
  );
  expect(usageDayAt(new Date("2026-08-24T16:00:00.000Z"))).toBe(
    "2026-08-25",
  );
});
