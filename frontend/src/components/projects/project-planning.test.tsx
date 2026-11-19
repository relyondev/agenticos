import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectPlanning } from "./project-planning";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const state = vi.hoisted(() => ({
  files: [] as { path: string }[],
  planeUrl: "https://plane.example.com" as string | undefined,
  upload: vi.fn(async () => undefined),
}));
vi.mock("@/hooks/use-organizations", () => ({ useTenantId: () => "org" }));
vi.mock("@/components/public-config/public-config-provider", () => ({
  usePublicConfig: () => ({ planeUrl: state.planeUrl }),
}));
vi.mock("@/lib/projects-api", () => ({
  listProjectFiles: async () => ({ items: state.files }),
  readEditableProjectFile: async () => ({
    content: JSON.stringify({ workspace: "acme", project: id }),
    revision: "r1",
  }),
  saveProjectFile: vi.fn(),
  uploadProjectFile: state.upload,
}));

function mount(writable: boolean) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProjectPlanning id="project" section="cycles" writable={writable} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state.files = [];
  state.planeUrl = "https://plane.example.com";
  state.upload.mockClear();
});

it("frames the linked Plane project on the section's own route", async () => {
  state.files = [{ path: "Project Planning/plane.json" }];
  mount(false);
  const frame = await screen.findByTitle("Plane Cycles");
  expect(frame).toHaveAttribute("src", `https://plane.example.com/acme/projects/${id}/cycles/`);
});

it("lets a writer link a Plane project and saves the pointer", async () => {
  mount(true);
  fireEvent.change(await screen.findByLabelText("Plane project address"), {
    target: { value: `https://plane.example.com/acme/projects/${id}/issues` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  await waitFor(() => expect(state.upload).toHaveBeenCalled());
});

it("rejects an address outside the configured Plane", async () => {
  mount(true);
  fireEvent.change(await screen.findByLabelText("Plane project address"), {
    target: { value: `https://evil.test/acme/projects/${id}/issues` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Paste a Plane project address");
  expect(state.upload).not.toHaveBeenCalled();
});

it("says so when Plane is not configured", async () => {
  state.planeUrl = undefined;
  mount(true);
  expect(await screen.findByRole("alert")).toHaveTextContent("PLANE_URL");
});
