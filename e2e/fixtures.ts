import { expect, test as base } from "@playwright/test";

type ConsoleFixtures = {
  assertNoBrowserErrors: void;
};

export const test = base.extend<ConsoleFixtures>({
  assertNoBrowserErrors: [async ({ page }, use) => {
    const errors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await use();

    expect(errors, `Browser console errors:\n${errors.join("\n")}`).toEqual([]);
  }, { auto: true }],
});

export { expect };
