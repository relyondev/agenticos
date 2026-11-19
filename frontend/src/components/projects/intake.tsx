"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { useTenantId } from "@/hooks/use-organizations";
import {
  INTAKE_STATUSES,
  acceptIntake,
  createIntake,
  declineIntake,
  deleteIntake,
  duplicateIntake,
  listIntake,
  snoozeIntake,
  updateIntake,
} from "@/lib/planning-api";
import type { IntakeRequest, IntakeStatus } from "@/lib/planning-api";
import { WORK_ITEM_PRIORITIES, listWorkItems } from "@/lib/work-items-api";
import type { WorkItemPriority } from "@/lib/work-items-api";

const field = "bg-background block w-full rounded border p-2";
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

function IntakeDetail({
  project,
  request,
  writable,
  onClose,
}: {
  project: string;
  request: IntakeRequest;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const client = useQueryClient();
  const [draft, setDraft] = useState(request);
  const [acceptPriority, setAcceptPriority] = useState<WorkItemPriority>(request.priority);
  const [until, setUntil] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [error, setError] = useState("");
  const items = useQuery({
    queryKey: ["work-items", tenant, project, "all"],
    queryFn: () => listWorkItems(project, {}),
  });
  const linked = items.data?.items.find((i) => i.id === request.work_item_id);
  const final = request.status === "accepted";
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["intake", tenant, project] });
    await client.invalidateQueries({ queryKey: ["work-items", tenant, project] });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>
          {cap(request.status)}
          {request.status === "snoozed" &&
            request.snoozed_until &&
            ` until ${request.snoozed_until}`}
          {request.status === "accepted" && linked && ` · work item #${linked.sequence_id}`}
          {request.status === "duplicate" && linked && ` · duplicate of #${linked.sequence_id}`}
        </h3>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <fieldset disabled={!writable || final || run.isPending} className="grid gap-3">
        <label>
          Title
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
            className={`${field} min-h-24`}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            className={field}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkItemPriority })}
          >
            {WORK_ITEM_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {writable && !final && (
        <>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(async () => {
                  await updateIntake(project, request.id, {
                    name: draft.name,
                    description: draft.description,
                    priority: draft.priority,
                  });
                })
              }
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={run.isPending}
              onClick={() => run.mutate(() => deleteIntake(project, request.id))}
            >
              Delete
            </Button>
          </div>
          <div className="space-y-2 border-t pt-3">
            <h4>Decide</h4>
            <div className="flex items-center gap-2">
              <select
                aria-label="Priority of the new work item"
                className={field}
                value={acceptPriority}
                onChange={(e) => setAcceptPriority(e.target.value as WorkItemPriority)}
              >
                {WORK_ITEM_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={run.isPending}
                onClick={() =>
                  run.mutate(() => acceptIntake(project, request.id, { priority: acceptPriority }))
                }
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={run.isPending}
                onClick={() => run.mutate(() => declineIntake(project, request.id))}
              >
                Decline
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Snooze until"
                className={field}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!until || run.isPending}
                onClick={() => run.mutate(() => snoozeIntake(project, request.id, until))}
              >
                Snooze
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Duplicate of"
                className={field}
                value={duplicateOf}
                onChange={(e) => setDuplicateOf(e.target.value)}
              >
                <option value="">Duplicate of…</option>
                {(items.data?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    #{i.sequence_id} {i.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!duplicateOf || run.isPending}
                onClick={() => run.mutate(() => duplicateIntake(project, request.id, duplicateOf))}
              >
                Mark duplicate
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Intake({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const client = useQueryClient();
  const [status, setStatus] = useState<IntakeStatus | "">("pending");
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState<IntakeRequest | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["intake", tenant, project, status],
    queryFn: () => listIntake(project, status || undefined),
  });
  const create = useMutation({
    mutationFn: () => createIntake(project, { name: title.trim() }),
    onSuccess: async () => {
      setTitle("");
      setError("");
      await client.invalidateQueries({ queryKey: ["intake", tenant, project] });
    },
    onError: (e: Error) => setError(e.message),
  });
  if (open)
    return (
      <IntakeDetail
        key={open.id}
        project={project}
        request={open}
        writable={writable}
        onClose={() => setOpen(null)}
      />
    );
  return (
    <section className="space-y-3 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter requests by status"
          className="bg-background rounded border p-2"
          value={status}
          onChange={(e) => setStatus(e.target.value as IntakeStatus | "")}
        >
          <option value="">All requests</option>
          {INTAKE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {cap(s)}
            </option>
          ))}
        </select>
      </div>
      {writable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <input
            aria-label="New request title"
            className={field}
            placeholder="New request"
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
      {(query.data ?? []).map((r) => (
        <button
          key={r.id}
          className="block w-full rounded border p-3 text-left"
          onClick={() => setOpen(r)}
        >
          {r.name}{" "}
          <small>
            {cap(r.status)}
            {r.priority !== "none" && ` · ${r.priority}`}
          </small>
        </button>
      ))}
    </section>
  );
}
