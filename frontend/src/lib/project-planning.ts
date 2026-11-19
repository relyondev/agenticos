// Adapted from makeplane/plane v1.5.0, db/models/{issue,intake,module,cycle,page,view}.py.
// Copyright (c) 2023-present Plane Software, Inc. and contributors.
// SPDX-License-Identifier: AGPL-3.0-only
// Relyon adaptation: project-scoped workspace records, November 2026.
import { z } from "zod";

export const sections = ["work-items", "cycles", "modules", "views", "pages", "intake"] as const;
export type Section = (typeof sections)[number];
export const titles: Record<Section, string> = {
  "work-items": "Work Items",
  cycles: "Cycles",
  modules: "Modules",
  views: "Views",
  pages: "Pages",
  intake: "Intake",
};
export const priorities = ["none", "urgent", "high", "medium", "low"] as const;
export const states = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"] as const;
export const decisions = ["Pending", "Accepted", "Rejected", "Duplicate", "Snoozed"] as const;
export const recordSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(sections),
    title: z.string().trim().min(1).max(255),
    body: z.string(),
    status: z.enum(states),
    priority: z.enum(priorities),
    cycle: z.string(),
    modules: z.array(z.string()),
    owner: z.string(),
    start: z.string(),
    end: z.string(),
    intake: z.enum(decisions),
    stateFilter: z.union([z.literal(""), z.enum(states)]),
    priorityFilter: z.union([z.literal(""), z.enum(priorities)]),
  })
  .refine((r) => !r.start || !r.end || r.start <= r.end, "End date precedes start date");
export type PlanningRecord = z.infer<typeof recordSchema>;
export function createRecord(kind: Section): PlanningRecord {
  return {
    id: crypto.randomUUID(),
    kind,
    title: "",
    body: "",
    status: "Backlog",
    priority: "none",
    cycle: "",
    modules: [],
    owner: "",
    start: "",
    end: "",
    intake: "Pending",
    stateFilter: "",
    priorityFilter: "",
  };
}
export function isWorkItem(r: PlanningRecord) {
  return r.kind === "work-items" || (r.kind === "intake" && r.intake === "Accepted");
}
export function related(group: PlanningRecord, item: PlanningRecord) {
  if (!isWorkItem(item)) return false;
  if (group.kind === "cycles") return item.cycle === group.id;
  if (group.kind === "modules") return item.modules.includes(group.id);
  return (
    group.kind === "views" &&
    (!group.stateFilter || group.stateFilter === item.status) &&
    (!group.priorityFilter || group.priorityFilter === item.priority)
  );
}

// Adapted from Plane's cycle queryset annotation in app/views/cycle/base.py.
export function cycleStatus(record: PlanningRecord, today: string) {
  if (record.start && record.end && record.start <= today && today <= record.end) return "Current";
  if (record.start && record.start > today) return "Upcoming";
  if (record.end && record.end < today) return "Completed";
  return "Draft";
}
