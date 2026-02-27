import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProjectMetadata {
  id: string;
  name: string;
  created_at: string;
  modified_at: string;
  drone_count: number;
  duration_seconds: number;
}

export interface ProjectChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
}

export interface ProjectData {
  metadata: ProjectMetadata;
  spec: unknown | null;
  chat: ProjectChatMessage[];
  build_result: unknown | null;
}

export function useProject() {
  const [currentProject, setCurrentProject] =
    useState<ProjectMetadata | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const createProject = useCallback(
    async (name: string): Promise<ProjectMetadata> => {
      const meta = await invoke<ProjectMetadata>("create_project", { name });
      setCurrentProject(meta);
      setIsDirty(false);
      return meta;
    },
    [],
  );

  const listProjects = useCallback(async (): Promise<ProjectMetadata[]> => {
    return invoke<ProjectMetadata[]>("list_projects");
  }, []);

  const openProject = useCallback(
    async (id: string): Promise<ProjectData> => {
      const data = await invoke<ProjectData>("open_project", { id });
      setCurrentProject(data.metadata);
      setIsDirty(false);
      return data;
    },
    [],
  );

  const saveProject = useCallback(
    async (
      chat: ProjectChatMessage[],
      spec?: unknown,
      buildResult?: unknown,
    ) => {
      await invoke("save_project", {
        chat,
        spec: spec ?? null,
        buildResult: buildResult ?? null,
      });
      setIsDirty(false);
    },
    [],
  );

  const deleteProject = useCallback(async (id: string) => {
    await invoke("delete_project", { id });
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    await invoke("rename_project", { id, name });
    setCurrentProject((prev) =>
      prev && prev.id === id ? { ...prev, name } : prev,
    );
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    invoke("mark_dirty").catch(() => {});
  }, []);

  const forceClose = useCallback(async () => {
    await invoke("force_close");
  }, []);

  return {
    currentProject,
    isDirty,
    createProject,
    listProjects,
    openProject,
    saveProject,
    deleteProject,
    renameProject,
    markDirty,
    forceClose,
  };
}
