import { useState, useEffect, useCallback } from "react";
import type { ProjectMetadata } from "../hooks/useProject";

interface ProjectPickerProps {
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  listProjects: () => Promise<ProjectMetadata[]>;
}

export default function ProjectPicker({
  onOpen,
  onCreate,
  onDelete,
  listProjects,
}: ProjectPickerProps) {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
  }, [listProjects]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = () => {
    const name = newName.trim() || "Untitled Show";
    onCreate(name);
    setNewName("");
    setShowCreate(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDelete === id) {
      onDelete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-secondary) 1px, transparent 1px), linear-gradient(90deg, var(--text-secondary) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-lg w-full p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-white"
              >
                <circle cx="8" cy="5" r="2" fill="currentColor" />
                <circle cx="4" cy="10" r="1.5" fill="currentColor" opacity="0.7" />
                <circle cx="12" cy="10" r="1.5" fill="currentColor" opacity="0.7" />
                <circle cx="8" cy="13" r="1" fill="currentColor" opacity="0.4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              DroneAI Studio
            </h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)] ml-11">
            Your drone show projects
          </p>
        </div>

        {/* New project */}
        {showCreate ? (
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowCreate(false);
              }}
              placeholder="Show name..."
              autoFocus
              className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full mb-6 px-4 py-3.5 border-2 border-dashed border-[var(--border)] rounded-xl text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all duration-200 group"
          >
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-5 rounded-md border border-current flex items-center justify-center text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                +
              </span>
              New Project
            </span>
          </button>
        )}

        {/* Project list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onOpen(project.id)}
              onMouseLeave={() => setConfirmDelete(null)}
              className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/50 cursor-pointer transition-all duration-150 group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {project.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {formatDate(project.modified_at)}
                  {project.drone_count > 0 && (
                    <span className="ml-2 opacity-60">
                      {project.drone_count} drones &middot;{" "}
                      {project.duration_seconds.toFixed(0)}s
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(e, project.id)}
                className={`text-xs px-2 py-1 rounded transition-colors ml-3 flex-shrink-0 ${
                  confirmDelete === project.id
                    ? "text-red-400 bg-red-400/10"
                    : "text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:text-red-400"
                }`}
              >
                {confirmDelete === project.id ? "Confirm?" : "Delete"}
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-secondary)]">
                No projects yet.
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
                Create one to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
