import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LoadingScreenProps {
  onReady: () => void;
}

type StepStatus = "pending" | "in_progress" | "completed" | "error";

interface LoadingStep {
  label: string;
  status: StepStatus;
  error?: string;
}

export default function LoadingScreen({ onReady }: LoadingScreenProps) {
  const [steps, setSteps] = useState<LoadingStep[]>([
    { label: "Preparing workspace", status: "in_progress" },
    { label: "Starting engine", status: "pending" },
    { label: "Connecting AI", status: "pending" },
  ]);
  const launched = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readyFired = useRef(false);

  const updateStep = useCallback(
    (index: number, update: Partial<LoadingStep>) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...update } : s))
      );
    },
    []
  );

  // Launch both services on mount
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    // Step 0: visual baseline delay
    setTimeout(() => {
      updateStep(0, { status: "completed" });
      updateStep(1, { status: "in_progress" });
      updateStep(2, { status: "in_progress" });
    }, 1000);

    // Launch Blender
    invoke("launch_blender").catch((e) => {
      updateStep(1, { status: "error", error: String(e) });
    });

    // Launch Claude
    invoke("new_chat").catch((e) => {
      updateStep(2, { status: "error", error: String(e) });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll statuses
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const bs = await invoke<string>("get_blender_status");
        if (bs === "running") {
          updateStep(1, { status: "completed" });
        }
      } catch {
        // ignore poll errors
      }

      try {
        const cs = await invoke<string>("get_claude_status");
        if (cs === "active") {
          updateStep(2, { status: "completed" });
        }
      } catch {
        // ignore poll errors
      }
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updateStep]);

  // Auto-transition when all steps complete
  useEffect(() => {
    const allDone = steps.every((s) => s.status === "completed");
    if (allDone && !readyFired.current) {
      readyFired.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      setTimeout(() => onReady(), 500);
    }
  }, [steps, onReady]);

  // Retry handler
  const handleRetry = useCallback(
    (index: number) => {
      updateStep(index, { status: "in_progress", error: undefined });
      if (index === 1) {
        invoke("launch_blender").catch((e) => {
          updateStep(1, { status: "error", error: String(e) });
        });
      } else if (index === 2) {
        invoke("new_chat").catch((e) => {
          updateStep(2, { status: "error", error: String(e) });
        });
      }
    },
    [updateStep]
  );

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progress = completedCount / steps.length;

  return (
    <div className="loading-screen">
      {/* Ambient glow behind content */}
      <div className="loading-ambient" />

      <div className="loading-screen-inner">
        {/* Logo */}
        <div className="loading-logo">
          <div className="loading-logo-glow" />
          <svg className="loading-logo-svg" width="48" height="48" viewBox="0 0 24 24" fill="none">
            <defs>
              <filter id="drone-glow">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.3" />
            <g filter="url(#drone-glow)">
              <circle cx="12" cy="8" r="2" fill="var(--accent)" />
              <circle cx="7" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
              <circle cx="17" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
              <circle cx="12" cy="17" r="1.2" fill="var(--accent)" opacity="0.4" />
            </g>
          </svg>
          <h1 className="loading-title">DroneAI Studio</h1>
        </div>

        {/* Steps */}
        <div className="loading-steps">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`loading-step loading-step--${step.status}`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="loading-step-indicator">
                {step.status === "completed" && (
                  <svg className="loading-checkmark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {step.status === "in_progress" && (
                  <div className="loading-spinner" />
                )}
                {step.status === "pending" && (
                  <div className="loading-dot" />
                )}
                {step.status === "error" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
              <div className="loading-step-content">
                <span className="loading-step-label">{step.label}</span>
                {step.status === "error" && (
                  <div className="loading-step-error">
                    <span className="loading-step-error-text">
                      {step.error || "Something went wrong"}
                    </span>
                    <button
                      className="loading-step-retry"
                      onClick={() => handleRetry(i)}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="loading-progress">
        <div
          className="loading-progress-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
