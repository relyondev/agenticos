import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Cycles } from "./cycles";
import { Modules } from "./modules";

const cycle = {
  id: "c1",
  project_id: "p",
  name: "Sprint 1",
  description: "",
  start_date: "2026-11-18",
  end_date: "2026-11-25",
  status: "current",
  total_items: 4,
  done_items: 1,
  created_at: "2026-11-18T00:00:00Z",
};
const mod = {
  id: "m1",
  project_id: "p",
  name: "Auth",
  description: "",
  status: "in_progress",
  start_date: null,
  target_date: "2026-12-01",
  lead_user_id: null,
  total_items: 2,
  done_items: 2,
  created_at: "2026-11-18T00:00:00Z",
};
const item = { id: "i1", sequence_id: 1, name: "Login page", state: "todo" };
const api = vi.hoisted(() => ({
  listCycles: vi.fn(),
  createCycle: vi.fn(),
  updateCycle: vi.fn(),
  deleteCycle: vi.fn(),
  listModules: vi.fn(),
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
  addToModule: vi.fn(),
  removeFromModule: vi.fn(),
  listWorkItems: vi.fn(),
}));
vi.mock("@/lib/planning-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/planning-api")>()),
  ...api,
}));
vi.mock("@/lib/work-items-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/work-items-api")>()),
  listWorkItems: api.listWorkItems,
}));
vi.mock("@/hooks/use-organizations", () => ({ useTenantId: () => "org" }));
vi.mock("@/hooks/use-members", () => ({ useMembers: () => ({ members: [] }) }));

function wrap(node: React.ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.listCycles.mockResolvedValue([cycle]);
  api.listModules.mockResolvedValue([mod]);
  api.listWorkItems.mockResolvedValue({ items: [item], total: 1 });
  api.createCycle.mockResolvedValue(cycle);
  api.createModule.mockResolvedValue(mod);
  api.updateCycle.mockResolvedValue(cycle);
  api.addToModule.mockResolvedValue(undefined);
});

it("shows a cycle with its status, dates and progress", async () => {
  wrap(<Cycles project="p" writable />);
  expect(await screen.findByText(/Sprint 1/)).toBeInTheDocument();
  expect(screen.getByText("1/4 done")).toBeInTheDocument();
  expect(screen.getByText(/Current/)).toBeInTheDocument();
});

it("creates a cycle and lists the items assigned to one", async () => {
  wrap(<Cycles project="p" writable />);
  fireEvent.change(await screen.findByLabelText("New cycle name"), {
    target: { value: "Sprint 2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.createCycle).toHaveBeenCalledWith("p", { name: "Sprint 2" }));
  fireEvent.click(await screen.findByText(/Sprint 1/));
  expect(await screen.findByText(/#1 Login page/)).toBeInTheDocument();
  expect(api.listWorkItems).toHaveBeenCalledWith("p", { cycle_id: "c1" });
});

it("reports a rejected cycle save", async () => {
  api.updateCycle.mockRejectedValue(new Error("The end date precedes the start date"));
  wrap(<Cycles project="p" writable />);
  fireEvent.click(await screen.findByText(/Sprint 1/));
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("end date precedes");
});

it("adds a work item to a module and shows its progress", async () => {
  api.listWorkItems.mockImplementation(async (_p: string, f: { module_id?: string }) =>
    f.module_id ? { items: [], total: 0 } : { items: [item], total: 1 },
  );
  wrap(<Modules project="p" writable />);
  expect(await screen.findByText("2/2 done")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Auth/));
  await screen.findByRole("option", { name: /Login page/ });
  fireEvent.change(await screen.findByLabelText("Add work item to module"), {
    target: { value: "i1" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Add" }).at(-1)!);
  await waitFor(() => expect(api.addToModule).toHaveBeenCalledWith("p", "m1", "i1"));
});

it("is read-only for a viewer", async () => {
  wrap(<Modules project="p" writable={false} />);
  fireEvent.click(await screen.findByText(/Auth/));
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.queryByLabelText("Add work item to module")).toBeNull();
});
