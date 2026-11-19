import { describe, it, expect } from "vitest";
import { parsePlaneProjectUrl, planeSectionUrl, sections } from "./project-planning";

const origin = "https://plane.example.com";
const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("plane link", () => {
  it("reads workspace and project from a project address", () => {
    expect(parsePlaneProjectUrl(`${origin}/acme/projects/${id}/issues/`, origin)).toEqual({
      workspace: "acme",
      project: id,
    });
  });
  it("rejects another origin, a non-project path and a bad id", () => {
    expect(parsePlaneProjectUrl(`https://evil.test/acme/projects/${id}/`, origin)).toBeNull();
    expect(parsePlaneProjectUrl(`${origin}/acme/issues`, origin)).toBeNull();
    expect(parsePlaneProjectUrl(`${origin}/acme/projects/not-a-uuid/`, origin)).toBeNull();
    expect(parsePlaneProjectUrl("nonsense", origin)).toBeNull();
  });
  it("builds Plane's own route for every section", () => {
    const link = { workspace: "acme", project: id };
    const urls = sections.map((s) => planeSectionUrl(origin, link, s));
    expect(urls[0]).toBe(`${origin}/acme/projects/${id}/issues/`);
    expect(urls.map((u) => u.split("/").at(-2))).toEqual([
      "issues",
      "cycles",
      "modules",
      "views",
      "pages",
      "intake",
    ]);
  });
});
