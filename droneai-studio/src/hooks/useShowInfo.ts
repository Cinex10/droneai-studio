import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ShowInfo } from "../components/Timeline/types";

export function useShowInfo() {
  const [showInfo, setShowInfo] = useState<ShowInfo | null>(null);

  const refreshShowInfo = useCallback(async () => {
    try {
      const info = await invoke<ShowInfo>("get_show_info");
      setShowInfo(info);
    } catch {
      // Project system may not be ready yet
    }
  }, []);

  return { showInfo, refreshShowInfo };
}
