import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SceneData } from "../types/scene";

export function useSceneData() {
  const [sceneData, setSceneData] = useState<SceneData | null>(null);

  useEffect(() => {
    const unlisten = listen<string>("scene-updated", (event) => {
      try {
        const data: SceneData = JSON.parse(event.payload);
        setSceneData(data);
      } catch (e) {
        console.error("Failed to parse scene data:", e);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const refreshScene = useCallback(async () => {
    try {
      const json = await invoke<string>("get_scene_data");
      const raw = JSON.parse(json);
      // Ensure drones array exists even if Blender returns partial data
      const data: SceneData = {
        frame_range: raw.frame_range ?? [0, 1440],
        fps: raw.fps ?? 24,
        drones: Array.isArray(raw.drones) ? raw.drones : [],
      };
      console.log(`[useSceneData] refreshScene: ${data.drones.length} drones found`);
      if (data.drones.length > 0) {
        console.log("[useSceneData] first drone:", data.drones[0].name, data.drones[0].position);
      }
      setSceneData(data);
    } catch (e) {
      console.error("[useSceneData] Failed to get scene data:", e);
    }
  }, []);

  const clearScene = useCallback(() => {
    setSceneData(null);
  }, []);

  return { sceneData, refreshScene, clearScene };
}
