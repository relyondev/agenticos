/**
 * API client for a project's cycles and modules (adapted from Plane, AGPL-3.0).
 */

import { apiClient } from "./api-client";

export type CycleStatus = "draft" | "upcoming" | "current" | "completed";
export const MODULE_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export interface Cycle {
  id: string;
  project_id: string;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  status: CycleStatus;
  total_items: number;
  done_items: number;
  created_at: string;
}

export interface CycleInput {
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Module {
  id: string;
  project_id: string;
  name: string;
  description: string;
  status: ModuleStatus;
  start_date: string | null;
  target_date: string | null;
  lead_user_id: string | null;
  total_items: number;
  done_items: number;
  created_at: string;
}

export interface ModuleInput {
  name: string;
  description: string;
  status: ModuleStatus;
  start_date: string | null;
  target_date: string | null;
  lead_user_id: string | null;
}

const root = (project: string) => `/projects/${project}`;

export const listCycles = (project: string) =>
  apiClient.get<{ items: Cycle[] }>(`${root(project)}/cycles`).then((r) => r.items);
export const createCycle = (project: string, input: Partial<CycleInput> & { name: string }) =>
  apiClient.post<Cycle>(`${root(project)}/cycles`, input);
export const updateCycle = (project: string, id: string, input: Partial<CycleInput>) =>
  apiClient.patch<Cycle>(`${root(project)}/cycles/${id}`, input);
export const deleteCycle = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/cycles/${id}`);

export const listModules = (project: string) =>
  apiClient.get<{ items: Module[] }>(`${root(project)}/modules`).then((r) => r.items);
export const createModule = (project: string, input: Partial<ModuleInput> & { name: string }) =>
  apiClient.post<Module>(`${root(project)}/modules`, input);
export const updateModule = (project: string, id: string, input: Partial<ModuleInput>) =>
  apiClient.patch<Module>(`${root(project)}/modules/${id}`, input);
export const deleteModule = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/modules/${id}`);
export const addToModule = (project: string, module: string, item: string) =>
  apiClient.put<void>(`${root(project)}/modules/${module}/work-items/${item}`);
export const removeFromModule = (project: string, module: string, item: string) =>
  apiClient.delete<void>(`${root(project)}/modules/${module}/work-items/${item}`);

// -- views ------------------------------------------------------------------

export interface ViewFilters {
  state?: string | null;
  priority?: string | null;
  assignee_user_id?: string | null;
  label?: string | null;
  cycle_id?: string | null;
  module_id?: string | null;
  due_before?: string | null;
  q?: string | null;
}

export interface ProjectView {
  id: string;
  project_id: string;
  name: string;
  description: string;
  filters: ViewFilters;
  created_at: string;
}

export const listViews = (project: string) =>
  apiClient.get<{ items: ProjectView[] }>(`${root(project)}/views`).then((r) => r.items);
export const createView = (
  project: string,
  input: { name: string; description?: string; filters?: ViewFilters },
) => apiClient.post<ProjectView>(`${root(project)}/views`, input);
export const updateView = (
  project: string,
  id: string,
  input: { name?: string; description?: string; filters?: ViewFilters },
) => apiClient.patch<ProjectView>(`${root(project)}/views/${id}`, input);
export const deleteView = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/views/${id}`);
export const listViewItems = (project: string, id: string) =>
  apiClient.get<import("./work-items-api").WorkItemList>(`${root(project)}/views/${id}/work-items`);

// -- intake -----------------------------------------------------------------

export const INTAKE_STATUSES = ["pending", "accepted", "declined", "snoozed", "duplicate"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export interface IntakeRequest {
  id: string;
  project_id: string;
  name: string;
  description: string;
  priority: import("./work-items-api").WorkItemPriority;
  status: IntakeStatus;
  requested_by_user_id: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  snoozed_until: string | null;
  work_item_id: string | null;
  created_at: string;
}

export const listIntake = (project: string, status?: IntakeStatus) =>
  apiClient
    .get<{ items: IntakeRequest[]; total: number }>(
      `${root(project)}/intake${status ? `?status=${status}` : ""}`,
    )
    .then((r) => r.items);
export const createIntake = (
  project: string,
  input: { name: string; description?: string; priority?: IntakeRequest["priority"] },
) => apiClient.post<IntakeRequest>(`${root(project)}/intake`, input);
export const updateIntake = (
  project: string,
  id: string,
  input: Partial<Pick<IntakeRequest, "name" | "description" | "priority">>,
) => apiClient.patch<IntakeRequest>(`${root(project)}/intake/${id}`, input);
export const deleteIntake = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/intake/${id}`);
export const acceptIntake = (
  project: string,
  id: string,
  input: { priority?: IntakeRequest["priority"] } = {},
) => apiClient.post<IntakeRequest>(`${root(project)}/intake/${id}/accept`, input);
export const declineIntake = (project: string, id: string) =>
  apiClient.post<IntakeRequest>(`${root(project)}/intake/${id}/decline`, {});
export const snoozeIntake = (project: string, id: string, until: string) =>
  apiClient.post<IntakeRequest>(`${root(project)}/intake/${id}/snooze`, { until });
export const duplicateIntake = (project: string, id: string, workItemId: string) =>
  apiClient.post<IntakeRequest>(`${root(project)}/intake/${id}/duplicate`, {
    work_item_id: workItemId,
  });

// -- pages ------------------------------------------------------------------

export interface PageSummary {
  id: string;
  project_id: string;
  name: string;
  revision: number;
  is_locked: boolean;
  archived_at: string | null;
  owned_by_user_id: string | null;
  last_edited_by_user_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Page extends PageSummary {
  content: string;
}

export interface PageVersionSummary {
  id: string;
  revision: number;
  name: string;
  edited_by_user_id: string | null;
  created_at: string;
}

export interface PageVersion extends PageVersionSummary {
  content: string;
}

export const listPages = (project: string, opts: { archived?: boolean; q?: string } = {}) => {
  const query = new URLSearchParams({ limit: "200" });
  if (opts.archived) query.set("archived", "true");
  if (opts.q?.trim()) query.set("q", opts.q.trim());
  return apiClient
    .get<{ items: PageSummary[]; total: number }>(`${root(project)}/pages?${query}`)
    .then((r) => r.items);
};
export const getPage = (project: string, id: string) =>
  apiClient.get<Page>(`${root(project)}/pages/${id}`);
export const createPage = (project: string, input: { name: string; content?: string }) =>
  apiClient.post<Page>(`${root(project)}/pages`, input);
export const updatePage = (
  project: string,
  id: string,
  input: { revision: number; name?: string; content?: string },
) => apiClient.patch<Page>(`${root(project)}/pages/${id}`, input);
export const deletePage = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/pages/${id}`);
export const setPageLock = (project: string, id: string, locked: boolean) =>
  apiClient.post<Page>(`${root(project)}/pages/${id}/${locked ? "lock" : "unlock"}`, {});
export const setPageArchived = (project: string, id: string, archived: boolean) =>
  apiClient.post<Page>(`${root(project)}/pages/${id}/${archived ? "archive" : "unarchive"}`, {});
export const listPageVersions = (project: string, id: string) =>
  apiClient.get<PageVersionSummary[]>(`${root(project)}/pages/${id}/versions`);
export const getPageVersion = (project: string, id: string, version: string) =>
  apiClient.get<PageVersion>(`${root(project)}/pages/${id}/versions/${version}`);
export const restorePageVersion = (project: string, id: string, version: string) =>
  apiClient.post<Page>(`${root(project)}/pages/${id}/versions/${version}/restore`, {});
