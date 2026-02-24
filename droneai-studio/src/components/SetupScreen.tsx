// droneai-studio/src/components/SetupScreen.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SetupScreenProps {
  onReady: () => void;
}

interface CheckResult {
  blender: boolean;
  claude: boolean;
}

export default function SetupScreen({ onReady }: SetupScreenProps) {
  const [checks, setChecks] = useState<CheckResult>({ blender: false, claude: false });
  const [launching, setLaunching] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    try {
      const blenderStatus = await invoke<string>("get_blender_status");
      const claudeStatus = await invoke<string>("get_claude_status");
      const result = {
        blender: blenderStatus === "running",
        claude: claudeStatus === "active",
      };
      setChecks(result);
      return result;
    } catch {
      return { blender: false, claude: false };
    }
  }, []);

  useEffect(() => {
    runChecks();
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
      if (target === "blender" && result.blender) {
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
      // Blender takes ~2s to start MCP server, poll until ready
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
      // Give Claude a moment to start, then poll
      startPolling("claude");
    } catch (e) {
      setLaunching(null);
      console.error("Failed to start Claude:", e);
    }
  };

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
                {checks.blender ? "Running" : launching === "blender" ? "Starting..." : "Not detected"}
              </p>
            </div>
            {checks.blender ? (
              <span className="text-green-400 text-sm">Ready</span>
            ) : (
              <button
                onClick={handleLaunchBlender}
                disabled={launching === "blender"}
                className="px-3 py-1 bg-[var(--accent)] text-white text-sm rounded hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {launching === "blender" ? "Starting..." : "Launch"}
              </button>
            )}
          </div>

          {/* Claude check */}
          <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Claude Code</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {checks.claude ? "Connected" : launching === "claude" ? "Connecting..." : "Not connected"}
              </p>
            </div>
            {checks.claude ? (
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

        {checks.blender && checks.claude && (
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
