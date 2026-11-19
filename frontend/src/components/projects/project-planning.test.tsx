import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createRecord } from "@/lib/project-planning";
import { ProjectPlanning } from "./project-planning";

const record = { ...createRecord("intake"), title: "Event registration" };
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/hooks/use-organizations", () => ({ useTenantId: () => "org" }));
vi.mock("@/lib/projects-api", () => ({
  listProjectFiles: async () => ({ items: [{ path: "Project Planning/" + record.id + ".json" }] }),
  readEditableProjectFile: async () => ({ content: JSON.stringify(record), revision: "first" }),
  saveProjectFile: save,
}));
function mount(writable: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectPlanning id="project" section="intake" writable={writable} />
    </QueryClientProvider>,
  );
}
it("persists an accepted request with the original record and revision", async () => {
  mount(true);
  fireEvent.click(await screen.findByRole("button", { name: /Event registration/ }));
  fireEvent.change(screen.getByLabelText("Review"), { target: { value: "Accepted" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith("project", "Project Planning/" + record.id + ".json", {
      content: JSON.stringify({ ...record, intake: "Accepted" }, null, 2),
      revision: "first",
    }),
  );
});
it("shows shared requests read-only to viewers", async () => {
  mount(false);
  fireEvent.click(await screen.findByRole("button", { name: /Event registration/ }));
  expect(screen.getByLabelText("Review")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});
