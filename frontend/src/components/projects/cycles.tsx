"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { getErrorMessage } from "@/lib/api-error";
import { useTenantId } from "@/hooks/use-organizations";
import { createCycle, deleteCycle, listCycles, updateCycle } from "@/lib/planning-api";
import type { Cycle } from "@/lib/planning-api";
import { STATE_LABELS, listWorkItems } from "@/lib/work-items-api";

const field = "bg-background block w-full rounded border p-2";
const STATUS: Record<Cycle["status"], string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  current: "Current",
  completed: "Completed",
};

function CycleDetail({
  project,
  cycle,
  writable,
  onClose,
}: {
  project: string;
  cycle: Cycle;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const client = useQueryClient();
  const [draft, setDraft] = useState(cycle);
  const [error, setError] = useState("");
  const items = useQuery({
    queryKey: ["work-items", tenant, project, "cycle", cycle.id],
    queryFn: () => listWorkItems(project, { cycle_id: cycle.id }),
  });
  const done = async () => {
    await client.invalidateQueries({ queryKey: ["cycles", tenant, project] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      updateCycle(project, cycle.id, {
        name: draft.name,
        description: draft.description,
        start_date: draft.start_date,
        end_date: draft.end_date,
      }),
    onSuccess: done,
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  const remove = useMutation({
    mutationFn: () => deleteCycle(project, cycle.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["work-items", tenant, project] });
      await done();
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>{STATUS[cycle.status]} cycle</h3>
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
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            className={`${field} min-h-20`}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Start date
            <input
              type="date"
              className={field}
              value={draft.start_date ?? ""}
              onChange={(e) => setDraft({ ...draft, start_date: e.target.value || null })}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              className={field}
              value={draft.end_date ?? ""}
              onChange={(e) => setDraft({ ...draft, end_date: e.target.value || null })}
            />
          </label>
        </div>
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
        <h4>
          Work items · {cycle.done_items}/{cycle.total_items} done
        </h4>
        {(items.data?.items ?? []).map((i) => (
          <p key={i.id} className="border-t py-1 text-sm">
            #{i.sequence_id} {i.name} <small>{STATE_LABELS[i.state]}</small>
          </p>
        ))}
        <p className="text-xs">Assign a work item to this cycle from the item’s own view.</p>
      </div>
    </div>
  );
}

export function Cycles({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<Cycle | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["cycles", tenant, project],
    queryFn: () => listCycles(project),
  });
  const create = useMutation({
    mutationFn: () => createCycle(project, { name: name.trim() }),
    onSuccess: async () => {
      setName("");
      setError("");
      await client.invalidateQueries({ queryKey: ["cycles", tenant, project] });
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  if (open)
    return (
      <CycleDetail
        key={open.id}
        project={project}
        cycle={open}
        writable={writable}
        onClose={() => setOpen(null)}
      />
    );
  return (
    <section className="space-y-3 p-2">
      {writable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            aria-label="New cycle name"
            className={field}
            placeholder="New cycle"
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {query.isLoading && <p>Loading…</p>}
      {query.error && <p role="alert">{getErrorMessage(query.error, tErrors)}</p>}
      {(query.data ?? []).map((c) => (
        <button
          key={c.id}
          className="block w-full rounded border p-3 text-left"
          onClick={() => setOpen(c)}
        >
          {c.name} <small>{STATUS[c.status]}</small>
          {(c.start_date || c.end_date) && (
            <small>
              {" "}
              · {c.start_date ?? "…"} → {c.end_date ?? "…"}
            </small>
          )}
          <progress
            className="mt-2 block w-full"
            aria-label={`${c.name} progress`}
            value={c.done_items}
            max={Math.max(c.total_items, 1)}
          />
          <small>
            {c.done_items}/{c.total_items} done
          </small>
        </button>
      ))}
    </section>
  );
}
