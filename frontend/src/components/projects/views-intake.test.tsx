import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Intake } from "./intake";
import { Views } from "./views";

const view = {
  id: "v1",
  project_id: "p",
  name: "Urgent",
  description: "",
  filters: { priority: "urgent" },
  created_at: "2026-11-20T00:00:00Z",
};
const request = {
  id: "r1",
  project_id: "p",
  name: "Event registration",
  description: "A form",
  priority: "high",
  status: "pending",
  requested_by_user_id: null,
  decided_by_user_id: null,
  decided_at: null,
  snoozed_until: null,
  work_item_id: null,
  created_at: "2026-11-20T00:00:00Z",
};
const item = { id: "w1", sequence_id: 7, name: "Login page", state: "todo" };
const api = vi.hoisted(() => ({
  listViews: vi.fn(),
  createView: vi.fn(),
  updateView: vi.fn(),
  deleteView: vi.fn(),
  listViewItems: vi.fn(),
  listIntake: vi.fn(),
  createIntake: vi.fn(),
  updateIntake: vi.fn(),
  deleteIntake: vi.fn(),
  acceptIntake: vi.fn(),
  declineIntake: vi.fn(),
  snoozeIntake: vi.fn(),
  duplicateIntake: vi.fn(),
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
  api.listViews.mockResolvedValue([view]);
  api.createView.mockResolvedValue(view);
  api.listViewItems.mockResolvedValue({ items: [item], total: 1 });
  api.listIntake.mockResolvedValue([request]);
  api.createIntake.mockResolvedValue(request);
  api.acceptIntake.mockResolvedValue({ ...request, status: "accepted", work_item_id: "w1" });
  api.declineIntake.mockResolvedValue(request);
  api.snoozeIntake.mockResolvedValue(request);
  api.duplicateIntake.mockResolvedValue(request);
  api.updateIntake.mockResolvedValue(request);
  api.listWorkItems.mockResolvedValue({ items: [item], total: 1 });
});

it("lists a view with its filters and shows the items it matches", async () => {
  wrap(<Views project="p" writable />);
  expect(await screen.findByText(/priority urgent/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Urgent"));
  expect(await screen.findByText(/#7 Login page/)).toBeInTheDocument();
  expect(screen.getByText(/Matching work items · 1/)).toBeInTheDocument();
});

it("creates a view from the chosen filters", async () => {
  wrap(<Views project="p" writable />);
  fireEvent.change(await screen.findByLabelText("New view name"), {
    target: { value: "Open bugs" },
  });
  fireEvent.change(screen.getByLabelText("Filter by label"), { target: { value: "bug" } });
  fireEvent.click(screen.getByRole("button", { name: "Save view" }));
  await waitFor(() =>
    expect(api.createView).toHaveBeenCalledWith("p", {
      name: "Open bugs",
      filters: { label: "bug" },
    }),
  );
});

it("lists pending requests first and adds a new one", async () => {
  wrap(<Intake project="p" writable />);
  expect(await screen.findByText(/Event registration/)).toBeInTheDocument();
  expect(api.listIntake).toHaveBeenCalledWith("p", "pending");
  fireEvent.change(screen.getByLabelText("New request title"), { target: { value: "Dark mode" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.createIntake).toHaveBeenCalledWith("p", { name: "Dark mode" }));
});

it("accepts a request with the chosen priority", async () => {
  wrap(<Intake project="p" writable />);
  fireEvent.click(await screen.findByText(/Event registration/));
  fireEvent.change(screen.getByLabelText("Priority of the new work item"), {
    target: { value: "urgent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  await waitFor(() =>
    expect(api.acceptIntake).toHaveBeenCalledWith("p", "r1", { priority: "urgent" }),
  );
});

it("declines, snoozes and marks a duplicate", async () => {
  wrap(<Intake project="p" writable />);
  fireEvent.click(await screen.findByText(/Event registration/));
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  await waitFor(() => expect(api.declineIntake).toHaveBeenCalledWith("p", "r1"));
});

it("shows an accepted request as final, pointing at its work item", async () => {
  api.listIntake.mockResolvedValue([{ ...request, status: "accepted", work_item_id: "w1" }]);
  wrap(<Intake project="p" writable />);
  fireEvent.click(await screen.findByText(/Event registration/));
  expect(await screen.findByText(/work item #7/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.getByLabelText("Title")).toBeDisabled();
});

it("is read-only for a viewer", async () => {
  wrap(<Intake project="p" writable={false} />);
  expect(screen.queryByLabelText("New request title")).toBeNull();
  fireEvent.click(await screen.findByText(/Event registration/));
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
});
