"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import {
  listProjectFiles,
  readEditableProjectFile,
  saveProjectFile,
  uploadProjectFile,
} from "@/lib/projects-api";
import { useTenantId } from "@/hooks/use-organizations";
import {
  cycleStatus,
  createRecord,
  decisions,
  isWorkItem,
  priorities,
  recordSchema,
  related,
  states,
  titles,
} from "@/lib/project-planning";
import type { PlanningRecord, Section } from "@/lib/project-planning";
const folder = "Project Planning/";
type Entry = { record: PlanningRecord; revision: string };
async function load(id: string): Promise<Entry[]> {
  const files = await listProjectFiles(id);
  if (files.truncated)
    throw new Error(
      "Project file listing is incomplete. Reduce the number of project files to load planning records.",
    );
  if (files.unreadable_reason) throw new Error(files.unreadable_reason);
  const paths = files.items.filter((f) => f.path.startsWith(folder) && f.path.endsWith(".json"));
  return Promise.all(
    paths.map(async (f) => {
      const file = await readEditableProjectFile(id, f.path);
      const record = recordSchema.parse(JSON.parse(file.content));
      if (f.path !== folder + record.id + ".json")
        throw new Error("Invalid record path: " + f.path);
      return { record, revision: file.revision };
    }),
  );
}
export function ProjectPlanning({
  id,
  section,
  writable,
}: {
  id: string;
  section: Section;
  writable: boolean;
}) {
  const tenant = useTenantId();
  const query = useQuery({
    queryKey: ["project-planning", tenant, id],
    queryFn: () => load(id),
    refetchInterval: 30000,
  });
  const [draft, setDraft] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const entries = query.data ?? [];
  const rows = entries.filter((e) =>
    section === "work-items" ? isWorkItem(e.record) : e.record.kind === section,
  );
  const r = draft?.record;
  function edit<K extends keyof PlanningRecord>(key: K, value: PlanningRecord[K]) {
    setDraft((d) => d && { ...d, record: { ...d.record, [key]: value } });
  }
  function open(entry: Entry) {
    setError("");
    setDraft(entry);
  }
  async function save() {
    if (!draft || !writable || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = recordSchema.parse(draft.record);
      const path = folder + data.id + ".json";
      const content = JSON.stringify(data, null, 2);
      if (draft.revision) await saveProjectFile(id, path, { content, revision: draft.revision });
      else
        await uploadProjectFile(id, new File([content], data.id + ".json"), path, {
          organizationId: tenant,
          onPercent: () => {},
          failed: "Could not save",
        });
      setDraft(null);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const select = (
    label: string,
    value: string,
    options: readonly string[],
    change: (s: string) => void,
  ) => (
    <label>
      {label}
      <select
        className="bg-background block w-full rounded border p-2"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="space-y-4 p-2">
      <div className="flex items-center justify-between">
        <h2>{titles[section]}</h2>
        {writable && !draft && (
          <Button onClick={() => open({ record: createRecord(section), revision: "" })}>Add</Button>
        )}
      </div>
      {query.isLoading && <p>Loading…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {!draft &&
        rows.map((entry) => (
          <button
            className="block w-full rounded border p-3 text-left"
            key={entry.record.id}
            onClick={() => open(entry)}
          >
            {entry.record.title}{" "}
            <small>
              {section === "work-items"
                ? entry.record.status
                : section === "intake"
                  ? entry.record.intake
                  : section === "cycles"
                    ? cycleStatus(entry.record, new Date().toISOString().slice(0, 10))
                    : ""}
            </small>
          </button>
        ))}
      {draft && r && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={!writable || busy} className="grid gap-3">
            <label>
              Title
              <input
                className="bg-background block w-full rounded border p-2"
                required
                maxLength={255}
                value={r.title}
                onChange={(e) => edit("title", e.target.value)}
              />
            </label>
            <label>
              {r.kind === "pages" ? "Page content" : "Description"}
              <textarea
                className="bg-background block min-h-28 w-full rounded border p-2"
                value={r.body}
                onChange={(e) => edit("body", e.target.value)}
              />
            </label>
            {r.kind === "intake" &&
              select("Review", r.intake, decisions, (s) =>
                edit("intake", decisions.find((v) => v === s) ?? "Pending"),
              )}
            {isWorkItem(r) && (
              <>
                {select("State", r.status, states, (s) =>
                  edit("status", states.find((v) => v === s) ?? "Backlog"),
                )}
                {select("Priority", r.priority, priorities, (s) =>
                  edit("priority", priorities.find((v) => v === s) ?? "none"),
                )}
                <label>
                  Assignee
                  <input
                    className="bg-background block rounded border p-2"
                    value={r.owner}
                    onChange={(e) => edit("owner", e.target.value)}
                  />
                </label>
                <label>
                  Cycle
                  <select
                    className="block"
                    value={r.cycle}
                    onChange={(e) => edit("cycle", e.target.value)}
                  >
                    <option value="">None</option>
                    {entries
                      .filter((e) => e.record.kind === "cycles")
                      .map(({ record: g }) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                  </select>
                </label>
                <fieldset>
                  <legend>Modules</legend>
                  {entries
                    .filter((e) => e.record.kind === "modules")
                    .map(({ record: g }) => (
                      <label key={g.id} className="mr-4">
                        <input
                          type="checkbox"
                          checked={r.modules.includes(g.id)}
                          onChange={(e) =>
                            edit(
                              "modules",
                              e.target.checked
                                ? [...r.modules, g.id]
                                : r.modules.filter((m) => m !== g.id),
                            )
                          }
                        />{" "}
                        {g.title}
                      </label>
                    ))}
                </fieldset>
              </>
            )}
            {(isWorkItem(r) || r.kind === "cycles" || r.kind === "modules") && (
              <div className="flex gap-3">
                {(["start", "end"] as const).map((k) => (
                  <label key={k}>
                    {k === "start" ? "Start date" : "End date"}
                    <input
                      className="block"
                      type="date"
                      value={r[k]}
                      onChange={(e) => edit(k, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            )}
            {r.kind === "views" && (
              <>
                {select("Filter by state", r.stateFilter, ["", ...states], (s) =>
                  edit("stateFilter", states.find((v) => v === s) ?? ""),
                )}
                {select("Filter by priority", r.priorityFilter, ["", ...priorities], (s) =>
                  edit("priorityFilter", priorities.find((v) => v === s) ?? ""),
                )}
              </>
            )}
          </fieldset>
          {["views", "cycles", "modules"].includes(r.kind) && (
            <div>
              <h3>Work Items</h3>
              {entries
                .filter((e) => related(r, e.record))
                .map(({ record: w }) => (
                  <p key={w.id}>
                    {w.title} · {w.status}
                  </p>
                ))}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-2">
            {writable && (
              <Button disabled={busy} type="submit">
                Save
              </Button>
            )}
            <Button variant="outline" type="button" disabled={busy} onClick={() => setDraft(null)}>
              Close
            </Button>
          </div>
        </form>
      )}
      <a className="text-xs underline" href="/planning-source.tar.gz" download>
        Planning source code · AGPL-3.0
      </a>
    </section>
  );
}
