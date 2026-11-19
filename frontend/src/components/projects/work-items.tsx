"use client";
/* eslint-disable jsx-a11y/no-static-element-interactions -- board drag is a mouse shortcut; the keyboard path is the State field in the item view. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { useMembers } from "@/hooks/use-members";
import { useTenantId } from "@/hooks/use-organizations";
import {
  STATE_LABELS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATES,
  addComment,
  createWorkItem,
  deleteWorkItem,
  listActivity,
  listComments,
  listWorkItems,
  updateWorkItem,
} from "@/lib/work-items-api";
import {
  addToModule,
  createView,
  listCycles,
  listModules,
  removeFromModule,
} from "@/lib/planning-api";
import type {
  WorkItem,
  WorkItemInput,
  WorkItemPriority,
  WorkItemState,
} from "@/lib/work-items-api";

const field = "bg-background block w-full rounded border p-2";

function WorkItemDetail({
  project,
  item,
  writable,
  onClose,
}: {
  project: string;
  item: WorkItem;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const { members } = useMembers(tenant ?? "");
  const client = useQueryClient();
  const [draft, setDraft] = useState<WorkItem>(item);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [moduleIds, setModuleIds] = useState<string[]>(item.module_ids);
  const refresh = () => client.invalidateQueries({ queryKey: ["work-items", tenant, project] });
  const cycles = useQuery({
    queryKey: ["cycles", tenant, project],
    queryFn: () => listCycles(project),
  });
  const modules = useQuery({
    queryKey: ["modules", tenant, project],
    queryFn: () => listModules(project),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (on) await addToModule(project, id, item.id);
      else await removeFromModule(project, id, item.id);
      return { id, on };
    },
    onSuccess: async ({ id, on }) => {
      setModuleIds((ids) => (on ? [...ids, id] : ids.filter((m) => m !== id)));
      await refresh();
      await client.invalidateQueries({ queryKey: ["modules", tenant, project] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const comments = useQuery({
    queryKey: ["work-item-comments", item.id],
    queryFn: () => listComments(project, item.id),
  });
  const activity = useQuery({
    queryKey: ["work-item-activity", item.id],
    queryFn: () => listActivity(project, item.id),
  });
  const save = useMutation({
    mutationFn: () => {
      const input: Partial<WorkItemInput> = {
        name: draft.name,
        description: draft.description,
        state: draft.state,
        priority: draft.priority,
        assignee_user_id: draft.assignee_user_id,
        start_date: draft.start_date,
        target_date: draft.target_date,
        labels: draft.labels,
        cycle_id: draft.cycle_id,
      };
      return updateWorkItem(project, item.id, input);
    },
    onSuccess: async () => {
      await refresh();
      await activity.refetch();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteWorkItem(project, item.id),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  const post = useMutation({
    mutationFn: () => addComment(project, item.id, comment),
    onSuccess: async () => {
      setComment("");
      await comments.refetch();
    },
    onError: (e: Error) => setError(e.message),
  });
  const set = <K extends keyof WorkItem>(key: K, value: WorkItem[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const who = (id: string | null) =>
    members.find((m) => m.user_id === id)?.full_name ??
    members.find((m) => m.user_id === id)?.email ??
    "—";

  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>#{item.sequence_id}</h3>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <fieldset disabled={!writable || save.isPending} className="grid gap-3">
        <label>
          Title
          <input
            className={field}
            maxLength={255}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            className={`${field} min-h-24`}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            State
            <select
              className={field}
              value={draft.state}
              onChange={(e) => set("state", e.target.value as WorkItemState)}
            >
              {WORK_ITEM_STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              className={field}
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value as WorkItemPriority)}
            >
              {WORK_ITEM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              className={field}
              value={draft.assignee_user_id ?? ""}
              onChange={(e) => set("assignee_user_id", e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Labels (comma separated)
            <input
              className={field}
              value={draft.labels.join(", ")}
              onChange={(e) =>
                set(
                  "labels",
                  e.target.value
                    .split(",")
                    .map((l) => l.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            Cycle
            <select
              className={field}
              value={draft.cycle_id ?? ""}
              onChange={(e) => set("cycle_id", e.target.value || null)}
            >
              <option value="">No cycle</option>
              {(cycles.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              className={field}
              value={draft.start_date ?? ""}
              onChange={(e) => set("start_date", e.target.value || null)}
            />
          </label>
          <label>
            Due date
            <input
              type="date"
              className={field}
              value={draft.target_date ?? ""}
              onChange={(e) => set("target_date", e.target.value || null)}
            />
          </label>
        </div>
      </fieldset>
      {(modules.data ?? []).length > 0 && (
        <fieldset disabled={!writable || toggle.isPending}>
          <legend>Modules</legend>
          {(modules.data ?? []).map((m) => (
            <label key={m.id} className="mr-4">
              <input
                type="checkbox"
                checked={moduleIds.includes(m.id)}
                onChange={(e) => toggle.mutate({ id: m.id, on: e.target.checked })}
              />{" "}
              {m.name}
            </label>
          ))}
        </fieldset>
      )}
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
        <h4>Comments</h4>
        {(comments.data ?? []).map((c) => (
          <p key={c.id} className="border-t py-1 text-sm">
            <strong>{who(c.author_user_id)}</strong> · {new Date(c.created_at).toLocaleString()}
            <br />
            {c.body}
          </p>
        ))}
        {writable && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) post.mutate();
            }}
          >
            <input
              aria-label="Add a comment"
              className={field}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button type="submit" disabled={post.isPending}>
              Comment
            </Button>
          </form>
        )}
      </div>
      <div>
        <h4>Activity</h4>
        {(activity.data ?? []).map((a) => (
          <p key={a.id} className="text-xs">
            {who(a.actor_user_id)}{" "}
            {a.field === "created" ? "created this item" : `changed ${a.field}`}
            {a.field !== "created" &&
              ` from “${a.old_value ?? "—"}” to “${a.new_value ?? "—"}”`} ·{" "}
            {new Date(a.created_at).toLocaleString()}
          </p>
        ))}
      </div>
    </div>
  );
}

export function WorkItems({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const client = useQueryClient();
  const [state, setState] = useState<WorkItemState | "">("");
  const [priority, setPriority] = useState<WorkItemPriority | "">("");
  const [q, setQ] = useState("");
  const [viewName, setViewName] = useState("");
  const [saved, setSaved] = useState("");
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState<WorkItem | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["work-items", tenant, project, state, priority, q],
    queryFn: () => listWorkItems(project, { state, priority, q }),
  });
  const create = useMutation({
    mutationFn: () => createWorkItem(project, { name: title.trim() }),
    onSuccess: async () => {
      setTitle("");
      setError("");
      await client.invalidateQueries({ queryKey: ["work-items", tenant, project] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const saveView = useMutation({
    mutationFn: () =>
      createView(project, {
        name: viewName.trim(),
        filters: { state: state || null, priority: priority || null, q: q.trim() || null },
      }),
    onSuccess: async () => {
      setSaved(`Saved view “${viewName.trim()}”`);
      setViewName("");
      await client.invalidateQueries({ queryKey: ["views", tenant, project] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const move = useMutation({
    mutationFn: ({ id, next }: { id: string; next: WorkItemState }) =>
      updateWorkItem(project, id, { state: next }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["work-items", tenant, project] }),
    onError: (e: Error) => setError(e.message),
  });
  const items = query.data?.items ?? [];

  if (open)
    return (
      <WorkItemDetail
        key={open.id}
        project={project}
        item={open}
        writable={writable}
        onClose={() => setOpen(null)}
      />
    );

  const row = (item: WorkItem) => (
    <button
      key={item.id}
      className="block w-full rounded border p-2 text-left"
      onClick={() => setOpen(item)}
    >
      #{item.sequence_id} {item.name}{" "}
      <small>
        {STATE_LABELS[item.state]}
        {item.priority !== "none" && ` · ${item.priority}`}
        {item.target_date && ` · due ${item.target_date}`}
      </small>
    </button>
  );

  return (
    <section className="space-y-3 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Search work items"
          className="bg-background rounded border p-2"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Filter by state"
          className="bg-background rounded border p-2"
          value={state}
          onChange={(e) => setState(e.target.value as WorkItemState | "")}
        >
          <option value="">Any state</option>
          {WORK_ITEM_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          className="bg-background rounded border p-2"
          value={priority}
          onChange={(e) => setPriority(e.target.value as WorkItemPriority | "")}
        >
          <option value="">Any priority</option>
          {WORK_ITEM_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLayout(layout === "list" ? "board" : "list")}
        >
          {layout === "list" ? "Board" : "List"}
        </Button>
      </div>
      {writable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (viewName.trim()) saveView.mutate();
          }}
        >
          <input
            aria-label="View name"
            className="bg-background rounded border p-2"
            placeholder="Save these filters as a view"
            maxLength={255}
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={saveView.isPending || !viewName.trim()}>
            Save as view
          </Button>
        </form>
      )}
      {saved && <p role="status">{saved}</p>}
      {writable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <input
            aria-label="New work item title"
            className="bg-background block w-full rounded border p-2"
            placeholder="New work item"
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {query.isLoading && <p>Loading…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {layout === "list" ? (
        <div className="space-y-2">{items.map(row)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          {WORK_ITEM_STATES.map((s) => (
            <div
              key={s}
              className="space-y-2 rounded border p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (writable && id) move.mutate({ id, next: s });
              }}
            >
              <h4>{STATE_LABELS[s]}</h4>
              {items
                .filter((i) => i.state === s)
                .map((i) => (
                  <div
                    key={i.id}
                    draggable={writable}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                  >
                    {row(i)}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
