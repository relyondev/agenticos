import { describe, it, expect } from "vitest";
import { createRecord, isWorkItem, related, recordSchema } from "./project-planning";
describe("project planning", () => {
  it("accepts an intake in place so links keep the same id", () => {
    const request = createRecord("intake");
    for (const intake of ["Pending", "Rejected", "Duplicate", "Snoozed"] as const)
      expect(isWorkItem({ ...request, intake })).toBe(false);
    expect(isWorkItem({ ...request, intake: "Accepted" })).toBe(true);
  });
  it("resolves cycle, module and combined saved filters", () => {
    const cycle = createRecord("cycles"),
      module = createRecord("modules");
    const issue = {
      ...createRecord("work-items"),
      cycle: cycle.id,
      modules: [module.id],
      priority: "urgent" as const,
    };
    expect(related(cycle, issue)).toBe(true);
    expect(related(module, issue)).toBe(true);
    const view = { ...createRecord("views"), priorityFilter: "urgent" as const };
    expect(related(view, issue)).toBe(true);
    expect(related({ ...view, stateFilter: "Done" }, issue)).toBe(false);
    expect(related(view, { ...issue, kind: "intake" })).toBe(false);
  });
  it("rejects reversed cycle dates", () => {
    expect(
      recordSchema.safeParse({
        ...createRecord("cycles"),
        title: "Sprint",
        start: "2026-12-02",
        end: "2026-12-01",
      }).success,
    ).toBe(false);
  });
});
