"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { usePublicConfig } from "@/components/public-config/public-config-provider";
import {
  listProjectFiles,
  readEditableProjectFile,
  saveProjectFile,
  uploadProjectFile,
} from "@/lib/projects-api";
import { useTenantId } from "@/hooks/use-organizations";
import {
  linkPath,
  linkSchema,
  parsePlaneProjectUrl,
  planeSectionUrl,
  titles,
} from "@/lib/project-planning";
import type { PlaneLink, Section } from "@/lib/project-planning";
import { WorkItems } from "./work-items";

type Stored = { link: PlaneLink; revision: string } | null;

async function load(id: string): Promise<Stored> {
  const files = await listProjectFiles(id);
  if (files.truncated) throw new Error("Project file listing is incomplete.");
  if (files.unreadable_reason) throw new Error(files.unreadable_reason);
  if (!files.items.some((f) => f.path === linkPath)) return null;
  const file = await readEditableProjectFile(id, linkPath);
  return { link: linkSchema.parse(JSON.parse(file.content)), revision: file.revision };
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
  if (section === "work-items") return <WorkItems project={id} writable={writable} />;
  return <PlaneSection id={id} section={section} writable={writable} />;
}

function PlaneSection({
  id,
  section,
  writable,
}: {
  id: string;
  section: Section;
  writable: boolean;
}) {
  const { planeUrl } = usePublicConfig();
  const tenant = useTenantId();
  const query = useQuery({ queryKey: ["project-plane-link", tenant, id], queryFn: () => load(id) });
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!planeUrl) {
    return (
      <p role="alert" className="p-4">
        Plane is not configured for this deployment. Set PLANE_URL to the address of your Plane.
      </p>
    );
  }
  if (query.isLoading) return <p className="p-4">Loading…</p>;
  if (query.error)
    return (
      <p role="alert" className="p-4">
        {query.error.message}
      </p>
    );

  const stored = query.data ?? null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!planeUrl || busy) return;
    const link = parsePlaneProjectUrl(address, planeUrl);
    if (!link) {
      setError(
        `Paste a Plane project address on ${planeUrl}, e.g. ${planeUrl}/workspace/projects/<id>/issues`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = JSON.stringify(link, null, 2);
      if (stored) await saveProjectFile(id, linkPath, { content, revision: stored.revision });
      else
        await uploadProjectFile(id, new File([content], "plane.json"), linkPath, {
          organizationId: tenant,
          onPercent: () => {},
          failed: "Could not save",
        });
      setEditing(false);
      setAddress("");
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!stored || editing) {
    return (
      <section className="space-y-3 p-4">
        <h2>{titles[section]}</h2>
        {writable ? (
          <form className="space-y-3" onSubmit={save}>
            <label className="block">
              Plane project address
              <input
                className="bg-background block w-full rounded border p-2"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={`${planeUrl}/workspace/projects/…`}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Link
              </Button>
              {stored && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p>This project is not linked to a Plane project yet.</p>
        )}
      </section>
    );
  }

  const src = planeSectionUrl(planeUrl, stored.link, section);
  return (
    <section className="flex h-full min-h-[70vh] flex-col gap-2">
      <div className="flex items-center justify-end gap-3 text-xs">
        <a className="underline" href={src} target="_blank" rel="noreferrer">
          Open in Plane
        </a>
        {writable && (
          <button className="underline" onClick={() => setEditing(true)}>
            Change link
          </button>
        )}
      </div>
      <iframe
        title={`Plane ${titles[section]}`}
        src={src}
        className="min-h-0 w-full flex-1 rounded border"
        allow="clipboard-read; clipboard-write"
      />
    </section>
  );
}
