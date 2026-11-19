import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { WorkItem } from "@/lib/work-items-api";
import { WorkItems } from "./work-items";

const item: WorkItem = {
  id: "i1",
  project_id: "p",
  sequence_id: 3,
  name: "Write brief",
  description: "",
  state: "todo",
  priority: "high",
  assignee_user_id: null,
  created_by_user_id: null,
  start_date: null,
  target_date: null,
  labels: [],
  completed_at: null,
  created_at: "2026-11-20T00:00:00Z",
  updated_at: null,
};
const api = vi.hoisted(() => ({
  listWorkItems: vi.fn(),
  createWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
  deleteWorkItem: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  listActivity: vi.fn(),
}));
vi.mock("@/lib/work-items-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/work-items-api")>()),
  ...api,
}));
vi.mock("@/hooks/use-organizations", () => ({ useTenantId: () => "org" }));
vi.mock("@/hooks/use-members", () => ({ useMembers: () => ({ members: [] }) }));

function mount(writable: boolean) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkItems project="p" writable={writable} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.listWorkItems.mockResolvedValue({ items: [item], total: 1 });
  api.createWorkItem.mockResolvedValue(item);
  api.updateWorkItem.mockResolvedValue(item);
  api.listComments.mockResolvedValue([]);
  api.listActivity.mockResolvedValue([]);
});

it("lists items with their number, state and priority", async () => {
  mount(true);
  expect(await screen.findByText(/#3 Write brief/)).toBeInTheDocument();
  expect(screen.getByText(/Todo · high/)).toBeInTheDocument();
});

it("creates an item from the title", async () => {
  mount(true);
  fireEvent.change(await screen.findByLabelText("New work item title"), {
    target: { value: "Ship it" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.createWorkItem).toHaveBeenCalledWith("p", { name: "Ship it" }));
});

it("filters by state through the API", async () => {
  mount(true);
  await screen.findByText(/#3/);
  fireEvent.change(screen.getByLabelText("Filter by state"), { target: { value: "done" } });
  await waitFor(() =>
    expect(api.listWorkItems).toHaveBeenLastCalledWith("p", { state: "done", priority: "", q: "" }),
  );
});

it("saves an edited state from the detail view", async () => {
  mount(true);
  fireEvent.click(await screen.findByText(/#3 Write brief/));
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "done" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.updateWorkItem).toHaveBeenCalledWith(
      "p",
      "i1",
      expect.objectContaining({ state: "done" }),
    ),
  );
});

it("is read-only for a viewer", async () => {
  mount(false);
  expect(screen.queryByLabelText("New work item title")).toBeNull();
  fireEvent.click(await screen.findByText(/#3 Write brief/));
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByLabelText("State")).toBeDisabled();
});
