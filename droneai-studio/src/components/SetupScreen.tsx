// droneai-studio/src/components/SetupScreen.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SetupScreenProps {
  onReady: () => void;
}

type BlenderStatus = "stopped" | "starting" | "running";

export default function SetupScreen({ onReady }: SetupScreenProps) {
  const [blenderStatus, setBlenderStatus] = useState<BlenderStatus>("stopped");
  const [claudeReady, setClaudeReady] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    try {
      const bs = await invoke<string>("get_blender_status");
      const cs = await invoke<string>("get_claude_status");

      const blender: BlenderStatus =
        bs === "running" ? "running" : bs === "starting" ? "starting" : "stopped";
      const claude = cs === "active";

      setBlenderStatus(blender);
      setClaudeReady(claude);
      return { blender, claude };
    } catch {
      return { blender: "stopped" as BlenderStatus, claude: false };
    }
  }, []);

  // Initial check + auto-poll when Blender is starting (process alive, MCP not ready)
  useEffect(() => {
    runChecks().then(({ blender }) => {
      if (blender === "starting") {
        startPolling("blender");
      }
    });
  }, [runChecks]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback((target: "blender" | "claude") => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const result = await runChecks();
      if (target === "blender" && result.blender === "running") {
        setLaunching(null);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (target === "claude" && result.claude) {
        setLaunching(null);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1500);
  }, [runChecks]);

  const handleLaunchBlender = async () => {
    try {
      setLaunching("blender");
      await invoke("launch_blender");
      // Blender takes ~5-10s to start MCP server, poll until ready
      startPolling("blender");
    } catch (e) {
      setLaunching(null);
      console.error("Failed to launch Blender:", e);
    }
  };

  const handleStartClaude = async () => {
    try {
      setLaunching("claude");
      await invoke("new_chat");
      startPolling("claude");
    } catch (e) {
      setLaunching(null);
      console.error("Failed to start Claude:", e);
    }
  };

  const blenderReady = blenderStatus === "running";
  const blenderAlive = blenderStatus !== "stopped";

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          DroneAI Studio
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">
          Setting up your workspace...
        </p>

        <div className="space-y-4">
          {/* Blender check */}
          <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Blender 4.x</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {blenderReady
                  ? "Running"
                  : blenderAlive || launching === "blender"
                    ? "Initializing MCP server..."
                    : "Not detected"}
              </p>
            </div>
            {blenderReady ? (
              <span className="text-green-400 text-sm">Ready</span>
            ) : blenderAlive || launching === "blender" ? (
              <span className="text-yellow-400 text-sm animate-pulse">Starting...</span>
            ) : (
              <button
                onClick={handleLaunchBlender}
                className="px-3 py-1 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)]"
              >
                Launch
              </button>
            )}
          </div>

          {/* Claude check */}
          <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Claude Code</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {claudeReady ? "Connected" : launching === "claude" ? "Connecting..." : "Not connected"}
              </p>
            </div>
            {claudeReady ? (
              <span className="text-green-400 text-sm">Ready</span>
            ) : (
              <button
                onClick={handleStartClaude}
                disabled={launching === "claude"}
                className="px-3 py-1 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {launching === "claude" ? "Connecting..." : "Connect"}
              </button>
            )}
          </div>
        </div>

        {blenderReady && claudeReady && (
          <button
            onClick={onReady}
            className="w-full mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:bg-[var(--accent-hover)]"
          >
            Start Designing
          </button>
        )}
      </div>
    </div>
  );
}
