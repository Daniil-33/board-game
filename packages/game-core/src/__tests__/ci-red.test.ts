import { expect, test } from "vitest";

// Deliberate failure to prove CI turns red (TASK-s1-ci). Never merge.
test("ci red-run proof", () => {
  expect(1).toBe(2);
});
