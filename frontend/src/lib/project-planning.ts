// Project planning is the team's real Plane, framed inside the project. Which
// Plane project a Relyon project shows is a small link file in the project's own
// workspace, so the agent and the team read the same pointer.
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

/** Plane's own route segment for each section. */
const segments: Record<Section, string> = {
  "work-items": "issues",
  cycles: "cycles",
  modules: "modules",
  views: "views",
  pages: "pages",
  intake: "intake",
};

export const linkPath = "Project Planning/plane.json";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const linkSchema = z.object({
  workspace: z.string().regex(SLUG),
  project: z.string().regex(UUID),
});
export type PlaneLink = z.infer<typeof linkSchema>;

/**
 * Read a Plane project address such as
 * `https://plane.example.com/acme/projects/<uuid>/issues/`. Null unless it is on
 * the configured Plane origin and names a workspace and a project.
 */
export function parsePlaneProjectUrl(input: string, planeOrigin: string): PlaneLink | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.origin !== planeOrigin) return null;
  const [workspace, projects, project] = url.pathname.split("/").filter(Boolean);
  if (projects !== "projects") return null;
  const parsed = linkSchema.safeParse({ workspace, project });
  return parsed.success ? parsed.data : null;
}

export function planeSectionUrl(planeOrigin: string, link: PlaneLink, section: Section): string {
  const { workspace, project } = link;
  return `${planeOrigin}/${encodeURIComponent(workspace)}/projects/${project}/${segments[section]}/`;
}
