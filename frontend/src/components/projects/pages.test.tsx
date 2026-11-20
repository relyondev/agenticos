import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import type { Page } from "@/lib/planning-api";
import { Pages } from "./pages";

const page: Page = {
  id: "g1",
  project_id: "p",
  name: "Launch spec",
  content: "# Plan",
  revision: 3,
  is_locked: false,
  archived_at: null,
  owned_by_user_id: null,
  last_edited_by_user_id: null,
  created_at: "2026-11-20T00:00:00Z",
  updated_at: "2026-11-20T01:00:00Z",
};
const api = vi.hoisted(() => ({
  listPages: vi.fn(),
  getPage: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  deletePage: vi.fn(),
  setPageLock: vi.fn(),
  setPageArchived: vi.fn(),
  listPageVersions: vi.fn(),
  getPageVersion: vi.fn(),
  restorePageVersion: vi.fn(),
}));
vi.mock("@/lib/planning-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/planning-api")>()),
  ...api,
}));
vi.mock("@/hooks/use-organizations", () => ({ useTenantId: () => "org" }));

function mount(writable: boolean) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Pages project="p" writable={writable} />
    </QueryClientProvider>,
  );
}
async function openPage() {
  fireEvent.click(await screen.findByText(/Launch spec/));
  await screen.findByText(/Revision 3/, { selector: "h3" });
}
beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.listPages.mockResolvedValue([page]);
  api.getPage.mockResolvedValue(page);
  api.createPage.mockResolvedValue({ ...page, id: "g2", name: "Notes", revision: 1 });
  api.updatePage.mockResolvedValue({ ...page, revision: 4 });
  api.setPageLock.mockResolvedValue({ ...page, is_locked: true });
  api.setPageArchived.mockResolvedValue({ ...page, archived_at: "2026-11-20T02:00:00Z" });
  api.listPageVersions.mockResolvedValue([
    {
      id: "v3",
      revision: 3,
      name: "Launch spec",
      edited_by_user_id: null,
      created_at: "2026-11-20T01:00:00Z",
    },
    {
      id: "v2",
      revision: 2,
      name: "Old name",
      edited_by_user_id: null,
      created_at: "2026-11-20T00:30:00Z",
    },
  ]);
  api.getPageVersion.mockResolvedValue({
    id: "v2",
    revision: 2,
    name: "Old name",
    content: "# Earlier",
    edited_by_user_id: null,
    created_at: "",
  });
  api.restorePageVersion.mockResolvedValue({ ...page, revision: 4 });
});

it("lists pages and the archived ones on request", async () => {
  mount(true);
  expect(await screen.findByText(/Launch spec/)).toBeInTheDocument();
  expect(api.listPages).toHaveBeenCalledWith("p", { archived: false, q: "" });
  fireEvent.click(screen.getByLabelText("Archived"));
  await waitFor(() =>
    expect(api.listPages).toHaveBeenLastCalledWith("p", { archived: true, q: "" }),
  );
});

it("creates a page and opens it", async () => {
  mount(true);
  fireEvent.change(await screen.findByLabelText("New page title"), { target: { value: "Notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.createPage).toHaveBeenCalledWith("p", { name: "Notes" }));
  await waitFor(() => expect(api.getPage).toHaveBeenCalledWith("p", "g2"));
});

it("saves an edit against the revision it was read at", async () => {
  mount(true);
  await openPage();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Launch spec v2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.updatePage).toHaveBeenCalledWith("p", "g1", {
      revision: 3,
      name: "Launch spec v2",
      content: "# Plan",
    }),
  );
});

it("tells the editor when someone else changed the page and offers a reload", async () => {
  api.updatePage.mockRejectedValue(new ApiError(409, "Someone else changed this page."));
  mount(true);
  await openPage();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Mine" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Someone else changed");
  expect(screen.getByRole("button", { name: "Reload the latest version" })).toBeInTheDocument();
});

it("previews and restores an earlier revision", async () => {
  mount(true);
  await openPage();
  fireEvent.click(await screen.findByLabelText("Preview revision 2"));
  expect(await screen.findByText("# Earlier")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Restore revision 2"));
  await waitFor(() => expect(api.restorePageVersion).toHaveBeenCalledWith("p", "g1", "v2"));
  expect(screen.queryByLabelText("Restore revision 3")).toBeNull();
});

it("locks and archives", async () => {
  mount(true);
  await openPage();
  fireEvent.click(screen.getByRole("button", { name: "Lock" }));
  await waitFor(() => expect(api.setPageLock).toHaveBeenCalledWith("p", "g1", true));
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(api.setPageArchived).toHaveBeenCalledWith("p", "g1", true));
});

it("offers deletion only once archived, and no editing when locked", async () => {
  api.getPage.mockResolvedValue({ ...page, is_locked: true, archived_at: "2026-11-20T02:00:00Z" });
  mount(true);
  fireEvent.click(await screen.findByText(/Launch spec/));
  expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.getByLabelText("Title")).toBeDisabled();
});

it("is read-only for a viewer", async () => {
  mount(false);
  expect(screen.queryByLabelText("New page title")).toBeNull();
  await openPage();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
  expect(screen.getByLabelText("Title")).toBeDisabled();
});
