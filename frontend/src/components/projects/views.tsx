"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { useTenantId } from "@/hooks/use-organizations";
import { createView, deleteView, listViewItems, listViews, updateView } from "@/lib/planning-api";
import type { ProjectView, ViewFilters } from "@/lib/planning-api";
import { STATE_LABELS, WORK_ITEM_PRIORITIES, WORK_ITEM_STATES } from "@/lib/work-items-api";

const field = "bg-background block w-full rounded border p-2";

export function describe(filters: ViewFilters): string {
  const parts = [
    filters.state && `state ${filters.state}`,
    filters.priority && `priority ${filters.priority}`,
    filters.label && `label ${filters.label}`,
    filters.due_before && `due by ${filters.due_before}`,
    filters.q && `“${filters.q}”`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All work items";
}

function FilterFields({
  filters,
  onChange,
}: {
  filters: ViewFilters;
  onChange: (next: ViewFilters) => void;
}) {
  const set = (key: keyof ViewFilters, value: string) =>
    onChange({ ...filters, [key]: value || null });
  return (
    <div className="grid grid-cols-2 gap-3">
      <label>
        Filter by state
        <select
          className={field}
          value={filters.state ?? ""}
          onChange={(e) => set("state", e.target.value)}
        >
          <option value="">Any state</option>
          {WORK_ITEM_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Filter by priority
        <select
          className={field}
          value={filters.priority ?? ""}
          onChange={(e) => set("priority", e.target.value)}
        >
          <option value="">Any priority</option>
          {WORK_ITEM_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Filter by label
        <input
          className={field}
          value={filters.label ?? ""}
          onChange={(e) => set("label", e.target.value)}
        />
      </label>
      <label>
        Due by
        <input
          type="date"
          className={field}
          value={filters.due_before ?? ""}
          onChange={(e) => set("due_before", e.target.value)}
        />
      </label>
      <label className="col-span-2">
        Search text
        <input
          className={field}
          value={filters.q ?? ""}
          onChange={(e) => set("q", e.target.value)}
        />
      </label>
    </div>
  );
}

function ViewDetail({
  project,
  view,
  writable,
  onClose,
}: {
  project: string;
  view: ProjectView;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const client = useQueryClient();
  const [name, setName] = useState(view.name);
  const [filters, setFilters] = useState<ViewFilters>(view.filters);
  const [error, setError] = useState("");
  const items = useQuery({
    queryKey: ["view-items", tenant, project, view.id],
    queryFn: () => listViewItems(project, view.id),
  });
  const done = async () => {
    await client.invalidateQueries({ queryKey: ["views", tenant, project] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => updateView(project, view.id, { name, filters }),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteView(project, view.id),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>{view.name}</h3>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <fieldset disabled={!writable || save.isPending} className="grid gap-3">
        <label>
          Name
          <input
            className={field}
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <FilterFields filters={filters} onChange={setFilters} />
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {writable && (
        <div className="flex gap-2">
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete
          </Button>
        </div>
      )}
      <div>
        <h4>Matching work items · {items.data?.total ?? 0}</h4>
        {(items.data?.items ?? []).map((i) => (
          <p key={i.id} className="border-t py-1 text-sm">
            #{i.sequence_id} {i.name} <small>{STATE_LABELS[i.state]}</small>
          </p>
        ))}
      </div>
    </div>
  );
}

export function Views({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<ViewFilters>({});
  const [open, setOpen] = useState<ProjectView | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["views", tenant, project],
    queryFn: () => listViews(project),
  });
  const create = useMutation({
    mutationFn: () => createView(project, { name: name.trim(), filters }),
    onSuccess: async () => {
      setName("");
      setFilters({});
      setError("");
      await client.invalidateQueries({ queryKey: ["views", tenant, project] });
    },
    onError: (e: Error) => setError(e.message),
  });
  if (open)
    return (
      <ViewDetail
        key={open.id}
        project={project}
        view={open}
        writable={writable}
        onClose={() => setOpen(null)}
      />
    );
  return (
    <section className="space-y-3 p-2">
      {writable && (
        <form
          className="space-y-3 rounded border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <label>
            New view name
            <input
              className={field}
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <FilterFields filters={filters} onChange={setFilters} />
          <Button type="submit" disabled={create.isPending}>
            Save view
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {query.isLoading && <p>Loading…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {(query.data ?? []).map((v) => (
        <button
          key={v.id}
          className="block w-full rounded border p-3 text-left"
          onClick={() => setOpen(v)}
        >
          {v.name} <small>{describe(v.filters)}</small>
        </button>
      ))}
    </section>
  );
}
