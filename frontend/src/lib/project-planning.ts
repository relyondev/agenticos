// The planning tabs a project shows. Each is native to this app: its data lives in
// the backend (work items, cycles, modules, views, intake, pages), adapted from
// Plane (AGPL-3.0, makeplane/plane v1.5.0).

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
