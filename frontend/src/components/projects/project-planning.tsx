"use client";
import type { Section } from "@/lib/project-planning";
import { Cycles } from "./cycles";
import { Intake } from "./intake";
import { Modules } from "./modules";
import { Pages } from "./pages";
import { Views } from "./views";
import { WorkItems } from "./work-items";

/** One planning tab of a project; `writable` is whether the caller may use the project. */
export function ProjectPlanning({
  id,
  section,
  writable,
}: {
  id: string;
  section: Section;
  writable: boolean;
}) {
  switch (section) {
    case "work-items":
      return <WorkItems project={id} writable={writable} />;
    case "cycles":
      return <Cycles project={id} writable={writable} />;
    case "modules":
      return <Modules project={id} writable={writable} />;
    case "views":
      return <Views project={id} writable={writable} />;
    case "pages":
      return <Pages project={id} writable={writable} />;
    case "intake":
      return <Intake project={id} writable={writable} />;
  }
}
