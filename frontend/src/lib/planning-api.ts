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
