"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { ApiError, getErrorMessage } from "@/lib/api-error";
import { useTenantId } from "@/hooks/use-organizations";
import {
  createPage,
  deletePage,
  getPage,
  getPageVersion,
  listPageVersions,
  listPages,
  restorePageVersion,
  setPageArchived,
  setPageLock,
  updatePage,
} from "@/lib/planning-api";
import type { Page } from "@/lib/planning-api";

const field = "bg-background block w-full rounded border p-2";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

function PageEditor({
  project,
  page,
  writable,
  onClose,
}: {
  project: string;
  page: Page;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const client = useQueryClient();
  const [name, setName] = useState(page.name);
  const [content, setContent] = useState(page.content);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const editable = writable && !page.is_locked && !page.archived_at;
  const dirty = name !== page.name || content !== page.content;
  const reload = async () => {
    await client.invalidateQueries({ queryKey: ["project-page", tenant, project, page.id] });
    await client.invalidateQueries({ queryKey: ["project-pages", tenant, project] });
    await client.invalidateQueries({ queryKey: ["page-versions", page.id] });
  };
  const fail = (e: unknown) => {
    setConflict(e instanceof ApiError && e.status === 409);
    setError(getErrorMessage(e, tErrors));
  };
  const act = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setError("");
      setConflict(false);
      await reload();
    },
    onError: fail,
  });
  const gone = useMutation({
    mutationFn: () => deletePage(project, page.id),
    onSuccess: async () => {
      await reload();
      onClose();
    },
    onError: fail,
  });
  const versions = useQuery({
    queryKey: ["page-versions", page.id],
    queryFn: () => listPageVersions(project, page.id),
  });
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3>
          Revision {page.revision}
          {page.is_locked && " · Locked"}
          {page.archived_at && " · Archived"}
        </h3>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <label className="block">
        Title
        <input
          className={field}
          maxLength={255}
          disabled={!editable}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <MarkdownEditor
        label="Page content"
        value={content}
        rows={18}
        disabled={!editable}
        maxLength={500000}
        onChange={(next) => setContent(next)}
      />
      {error && <p role="alert">{error}</p>}
      {conflict && (
        <Button type="button" variant="outline" onClick={() => void reload().then(onClose)}>
          Reload the latest version
        </Button>
      )}
      {writable && (
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button
              type="button"
              disabled={!dirty || !name.trim() || act.isPending}
              onClick={() =>
                act.mutate(() =>
                  updatePage(project, page.id, { revision: page.revision, name, content }),
                )
              }
            >
              Save
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={act.isPending}
            onClick={() => act.mutate(() => setPageLock(project, page.id, !page.is_locked))}
          >
            {page.is_locked ? "Unlock" : "Lock"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={act.isPending}
            onClick={() => act.mutate(() => setPageArchived(project, page.id, !page.archived_at))}
          >
            {page.archived_at ? "Restore from archive" : "Archive"}
          </Button>
          {page.archived_at && (
            <Button
              type="button"
              variant="outline"
              disabled={gone.isPending}
              onClick={() => gone.mutate()}
            >
              Delete
            </Button>
          )}
        </div>
      )}
      <div>
        <h4>Version history</h4>
        {(versions.data ?? []).map((v) => (
          <p key={v.id} className="flex items-center justify-between border-t py-1 text-sm">
            <span>
              Revision {v.revision} · {v.name} · {when(v.created_at)}
            </span>
            <span className="flex gap-3">
              <button
                className="text-xs underline"
                aria-label={`Preview revision ${v.revision}`}
                onClick={async () =>
                  setPreview((await getPageVersion(project, page.id, v.id)).content)
                }
              >
                Preview
              </button>
              {editable && v.revision !== page.revision && (
                <button
                  className="text-xs underline"
                  aria-label={`Restore revision ${v.revision}`}
                  onClick={() => act.mutate(() => restorePageVersion(project, page.id, v.id))}
                >
                  Restore
                </button>
              )}
            </span>
          </p>
        ))}
        {preview !== null && (
          <pre className="mt-2 max-h-64 overflow-auto rounded border p-2 text-xs whitespace-pre-wrap">
            {preview}
          </pre>
        )}
      </div>
    </div>
  );
}

function PageDetail({
  project,
  id,
  writable,
  onClose,
}: {
  project: string;
  id: string;
  writable: boolean;
  onClose: () => void;
}) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const query = useQuery({
    queryKey: ["project-page", tenant, project, id],
    queryFn: () => getPage(project, id),
  });
  if (query.error) return <p role="alert">{getErrorMessage(query.error, tErrors)}</p>;
  if (!query.data) return <p>Loading…</p>;
  return (
    <PageEditor
      // A new revision resets the draft to what is now saved.
      key={`${query.data.id}:${query.data.revision}:${query.data.is_locked}:${query.data.archived_at}`}
      project={project}
      page={query.data}
      writable={writable}
      onClose={onClose}
    />
  );
}

export function Pages({ project, writable }: { project: string; writable: boolean }) {
  const tenant = useTenantId();
  const tErrors = useTranslations("errors");
  const client = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["project-pages", tenant, project, archived, q],
    queryFn: () => listPages(project, { archived, q }),
  });
  const create = useMutation({
    mutationFn: () => createPage(project, { name: title.trim() }),
    onSuccess: async (page) => {
      setTitle("");
      setError("");
      await client.invalidateQueries({ queryKey: ["project-pages", tenant, project] });
      setOpen(page.id);
    },
    onError: (e: unknown) => setError(getErrorMessage(e, tErrors)),
  });
  if (open)
    return (
      <PageDetail
        key={open}
        project={project}
        id={open}
        writable={writable}
        onClose={() => setOpen(null)}
      />
    );
  return (
    <section className="space-y-3 p-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search pages"
          className="bg-background rounded border p-2"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          Archived
        </label>
      </div>
      {writable && !archived && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <input
            aria-label="New page title"
            className={field}
            placeholder="New page"
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
      {query.error && <p role="alert">{getErrorMessage(query.error, tErrors)}</p>}
      {(query.data ?? []).map((p) => (
        <button
          key={p.id}
          className="block w-full rounded border p-3 text-left"
          onClick={() => setOpen(p.id)}
        >
          {p.name}{" "}
          <small>
            {p.is_locked && "Locked · "}
            Revision {p.revision} · {when(p.updated_at ?? p.created_at)}
          </small>
        </button>
      ))}
    </section>
  );
}
