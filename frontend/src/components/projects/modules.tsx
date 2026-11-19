"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { getErrorMessage } from "@/lib/api-error";
import { useMembers } from "@/hooks/use-members";
import { useTenantId } from "@/hooks/use-organizations";
import {
  MODULE_STATUSES,
  addToModule,
  createModule,
  deleteModule,
  listModules,
  removeFromModule,
  updateModule,
} from "@/lib/planning-api";
import type { Module, ModuleStatus } from "@/lib/planning-api";
import { STATE_LABELS, listWorkItems } from "@/lib/work-items-api";

const field = "bg-background block w-full rounded border p-2";
const label = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

function ModuleDetail({
  project,
  module,
  writable,
  onClose,
}: {
  project: string;
  module: Module;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const { members } = useMembers(tenant ?? "");
  const client = useQueryClient();
  const [draft, setDraft] = useState(module);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const members_ = useQuery({
    queryKey: ["work-items", tenant, project, "module", module.id],
    queryFn: () => listWorkItems(project, { module_id: module.id }),
  });
  const all = useQuery({
    queryKey: ["work-items", tenant, project, "all"],
    queryFn: () => listWorkItems(project, {}),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["work-items", tenant, project] });
    await client.invalidateQueries({ queryKey: ["modules", tenant, project] });
  };
  const save = useMutation({
    mutationFn: () =>
      updateModule(project, module.id, {
        name: draft.name,
        description: draft.description,
        status: draft.status,
        start_date: draft.start_date,
        target_date: draft.target_date,
        lead_user_id: draft.lead_user_id,
      }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  const remove = useMutation({
    mutationFn: () => deleteModule(project, module.id),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  const add = useMutation({
    mutationFn: (item: string) => addToModule(project, module.id, item),
    onSuccess: async () => {
      setPick("");
      await refresh();
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  const drop = useMutation({
    mutationFn: (item: string) => removeFromModule(project, module.id, item),
    onSuccess: refresh,
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  const inModule = new Set((members_.data?.items ?? []).map((i) => i.id));
  const candidates = (all.data?.items ?? []).filter((i) => !inModule.has(i.id));
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>Module</h3>
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
            Status
            <select
              className={field}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as ModuleStatus })}
            >
              {MODULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lead
            <select
              className={field}
              value={draft.lead_user_id ?? ""}
              onChange={(e) => setDraft({ ...draft, lead_user_id: e.target.value || null })}
            >
              <option value="">No lead</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email}
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
              onChange={(e) => setDraft({ ...draft, start_date: e.target.value || null })}
            />
          </label>
          <label>
            Target date
            <input
              type="date"
              className={field}
              value={draft.target_date ?? ""}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value || null })}
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
          Work items · {module.done_items}/{module.total_items} done
        </h4>
        {(members_.data?.items ?? []).map((i) => (
          <p key={i.id} className="flex items-center justify-between border-t py-1 text-sm">
            <span>
              #{i.sequence_id} {i.name} <small>{STATE_LABELS[i.state]}</small>
            </span>
            {writable && (
              <button
                className="text-xs underline"
                aria-label={`Remove #${i.sequence_id} from module`}
                onClick={() => drop.mutate(i.id)}
              >
                Remove
              </button>
            )}
          </p>
        ))}
        {writable && (
          <div className="mt-2 flex gap-2">
            <select
              aria-label="Add work item to module"
              className={field}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Add a work item…</option>
              {candidates.map((i) => (
                <option key={i.id} value={i.id}>
                  #{i.sequence_id} {i.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!pick || add.isPending}
              onClick={() => add.mutate(pick)}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Modules({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<Module | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["modules", tenant, project],
    queryFn: () => listModules(project),
  });
  const create = useMutation({
    mutationFn: () => createModule(project, { name: name.trim() }),
    onSuccess: async () => {
      setName("");
      setError("");
      await client.invalidateQueries({ queryKey: ["modules", tenant, project] });
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  if (open)
    return (
      <ModuleDetail
        key={open.id}
        project={project}
        module={open}
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
            aria-label="New module name"
            className={field}
            placeholder="New module"
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
      {(query.data ?? []).map((m) => (
        <button
          key={m.id}
          className="block w-full rounded border p-3 text-left"
          onClick={() => setOpen(m)}
        >
          {m.name} <small>{label(m.status)}</small>
          {m.target_date && <small> · target {m.target_date}</small>}
          <progress
            className="mt-2 block w-full"
            aria-label={`${m.name} progress`}
            value={m.done_items}
            max={Math.max(m.total_items, 1)}
          />
          <small>
            {m.done_items}/{m.total_items} done
          </small>
        </button>
      ))}
    </section>
  );
}
