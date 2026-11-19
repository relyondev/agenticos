/**
 * API client for a project's work items (adapted from Plane's issue model, AGPL-3.0).
 */

import { apiClient } from "./api-client";

export const WORK_ITEM_STATES = ["backlog", "todo", "in_progress", "done", "cancelled"] as const;
export const WORK_ITEM_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
export type WorkItemState = (typeof WORK_ITEM_STATES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export const STATE_LABELS: Record<WorkItemState, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

export interface WorkItem {
  id: string;
  project_id: string;
  sequence_id: number;
  name: string;
  description: string;
  state: WorkItemState;
  priority: WorkItemPriority;
  assignee_user_id: string | null;
  created_by_user_id: string | null;
  start_date: string | null;
  target_date: string | null;
  labels: string[];
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface WorkItemList {
  items: WorkItem[];
  total: number;
}

export interface WorkItemInput {
  name: string;
  description: string;
  state: WorkItemState;
  priority: WorkItemPriority;
  assignee_user_id: string | null;
  start_date: string | null;
  target_date: string | null;
  labels: string[];
}

export interface WorkItemComment {
  id: string;
  work_item_id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
}

export interface WorkItemActivity {
  id: string;
  actor_user_id: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface WorkItemFilters {
  state?: WorkItemState | "";
  priority?: WorkItemPriority | "";
  q?: string;
}

const root = (project: string) => `/projects/${project}/work-items`;

export function listWorkItems(project: string, filters: WorkItemFilters = {}) {
  const query = new URLSearchParams({ limit: "200" });
  if (filters.state) query.set("state", filters.state);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.q?.trim()) query.set("q", filters.q.trim());
  return apiClient.get<WorkItemList>(`${root(project)}?${query}`);
}

export const createWorkItem = (project: string, input: Partial<WorkItemInput> & { name: string }) =>
  apiClient.post<WorkItem>(root(project), input);

export const updateWorkItem = (project: string, id: string, input: Partial<WorkItemInput>) =>
  apiClient.patch<WorkItem>(`${root(project)}/${id}`, input);

export const deleteWorkItem = (project: string, id: string) =>
  apiClient.delete<void>(`${root(project)}/${id}`);

export const listComments = (project: string, id: string) =>
  apiClient.get<WorkItemComment[]>(`${root(project)}/${id}/comments`);

export const addComment = (project: string, id: string, body: string) =>
  apiClient.post<WorkItemComment>(`${root(project)}/${id}/comments`, { body });

export const listActivity = (project: string, id: string) =>
  apiClient.get<WorkItemActivity[]>(`${root(project)}/${id}/activity`);
