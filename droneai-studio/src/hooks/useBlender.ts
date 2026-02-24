// droneai-studio/src/hooks/useBlender.ts
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseBlender {
  status: "stopped" | "running" | "error";
  launch: () => Promise<void>;
  error: string | null;
}

export function useBlender(): UseBlender {
  const [status, setStatus] = useState<"stopped" | "running" | "error">("stopped");
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(async () => {
    try {
      await invoke("launch_blender");
      setStatus("running");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }, []);

  return { status, launch, error };
}
