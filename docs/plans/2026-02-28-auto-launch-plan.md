# Auto-Launch Loading Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the manual SetupScreen with an automatic LoadingScreen that launches Blender and Claude in parallel, showing animated progress steps, and transitions to workspace when ready.

**Architecture:** Delete `SetupScreen.tsx`, create `LoadingScreen.tsx` that auto-launches both services on mount and polls until ready. Move the `onReady` logic from App.tsx into the auto-transition. Rename "Claude disconnected" to "AI disconnected" in workspace. Use `/frontend-design` skill for LoadingScreen visual design.

**Tech Stack:** React, TypeScript, Tailwind CSS, Tauri invoke API, CSS animations

---

### Task 1: Delete SetupScreen and Update App.tsx Screen Type

**Files:**
- Delete: `droneai-studio/src/components/SetupScreen.tsx`
- Modify: `droneai-studio/src/App.tsx:1-20`

**Step 1: Remove SetupScreen import and update Screen type**

In `droneai-studio/src/App.tsx`, remove line 9:

```typescript
// DELETE THIS LINE:
import SetupScreen from "./components/SetupScreen";
```

Change line 20 from:

```typescript
type Screen = "picker" | "setup" | "workspace";
```

to:

```typescript
type Screen = "picker" | "loading" | "workspace";
```

**Step 2: Update ProjectPicker handlers to use "loading" screen**

In `droneai-studio/src/App.tsx`, in `handleCreateProject` (around line 271), change:

```typescript
setScreen("setup");
```

to:

```typescript
setScreen("loading");
```

In `handleOpenProject` (around line 295), change the same:

```typescript
setScreen("setup");
```

to:

```typescript
setScreen("loading");
```

**Step 3: Replace the setup screen routing block**

In `droneai-studio/src/App.tsx`, replace the entire `if (screen === "setup")` block (lines 416-453) with a placeholder that we'll fill in Task 3:

```typescript
if (screen === "loading") {
    return <div>Loading...</div>;
  }
```

**Step 4: Delete SetupScreen.tsx**

```bash
rm droneai-studio/src/components/SetupScreen.tsx
```

**Step 5: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add -u droneai-studio/src/
git commit -m "refactor: remove SetupScreen, switch to loading screen flow"
```

---

### Task 2: Create LoadingScreen Component

**Files:**
- Create: `droneai-studio/src/components/LoadingScreen.tsx`

Use the `/frontend-design` skill to design this component. The requirements:

**Functional requirements:**
- On mount: call `invoke("launch_blender")` and `invoke("new_chat")` in parallel
- Poll `invoke<string>("get_blender_status")` and `invoke<string>("get_claude_status")` every 1000ms
- Track 3 steps: "Preparing workspace", "Starting engine" (Blender), "Connecting AI" (Claude)
- Step states: `pending` | `in_progress` | `completed` | `error`
- "Preparing workspace" completes after 1 second (visual baseline)
- "Starting engine" completes when Blender status === "running"
- "Connecting AI" completes when Claude status === "active"
- On error: step shows error message + "Retry" button. Retry re-invokes the failed command
- When all 3 steps are `completed`, call `onReady()` after a 500ms delay (for visual satisfaction)
- Stop polling on unmount

**Props interface:**

```typescript
interface LoadingScreenProps {
  onReady: () => void;
}
```

**Visual requirements (use /frontend-design for styling):**
- Full-screen centered layout, themed with CSS variables (`--bg-primary`, `--text-primary`, etc.)
- App logo/title "DroneAI Studio" at top
- 3 vertical steps with animated spinner → checkmark transitions
- No mention of "Blender" or "Claude" in any user-visible text
- Smooth, polished feel — not generic

**Step 1: Create the component file**

Create `droneai-studio/src/components/LoadingScreen.tsx` with the full implementation. Here is the functional skeleton — the `/frontend-design` skill should enhance the visuals:

```typescript
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

  return (
    <div className="loading-screen">
      <div className="loading-screen-inner">
        {/* Logo */}
        <div className="loading-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
            <circle cx="12" cy="8" r="2" fill="var(--accent)" />
            <circle cx="7" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
            <circle cx="17" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
            <circle cx="12" cy="17" r="1.2" fill="var(--accent)" opacity="0.4" />
          </svg>
          <h1 className="loading-title">DroneAI Studio</h1>
        </div>

        {/* Steps */}
        <div className="loading-steps">
          {steps.map((step, i) => (
            <div key={i} className={`loading-step loading-step--${step.status}`}>
              <div className="loading-step-indicator">
                {step.status === "completed" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds (component exists but isn't imported yet)

**Step 3: Commit**

```bash
git add droneai-studio/src/components/LoadingScreen.tsx
git commit -m "feat: create LoadingScreen component with auto-launch"
```

---

### Task 3: Wire LoadingScreen into App.tsx

**Files:**
- Modify: `droneai-studio/src/App.tsx`

**Step 1: Add LoadingScreen import**

At the top of `droneai-studio/src/App.tsx`, add (replacing the old SetupScreen import location):

```typescript
import LoadingScreen from "./components/LoadingScreen";
```

**Step 2: Replace the loading screen routing block**

Replace the placeholder `if (screen === "loading")` block with:

```typescript
  if (screen === "loading") {
    return (
      <>
        <LoadingScreen
          onReady={async () => {
            if (isExistingProject) {
              try {
                suppressStreamRef.current = true;
                const chatForRestore: ProjectChatMessage[] = messages.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                }));
                await invoke("restore_chat", { messages: chatForRestore });
                setTimeout(() => { suppressStreamRef.current = false; }, 15000);
              } catch (e) {
                console.error("[App] Failed to restore chat:", e);
                suppressStreamRef.current = false;
              }
            } else {
              clearScene();
              clearShowInfo();
            }
            setIsRestoring(isExistingProject);
            setScreen("workspace");
            let attempts = 0;
            const poll = setInterval(async () => {
              attempts++;
              await refreshScene();
              await refreshShowInfo();
              if (attempts >= 5) clearInterval(poll);
            }, 2000);
          }}
        />
        {showCloseDialog && (
          <CloseDialog
            onSave={handleCloseSave}
            onDiscard={handleCloseDiscard}
            onCancel={handleCloseCancel}
          />
        )}
      </>
    );
  }
```

This is the exact same `onReady` logic that was previously in the SetupScreen routing block — just attached to LoadingScreen instead.

**Step 3: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add droneai-studio/src/App.tsx
git commit -m "feat: wire LoadingScreen into App routing with onReady logic"
```

---

### Task 4: Rename "Claude disconnected" to "AI disconnected"

**Files:**
- Modify: `droneai-studio/src/App.tsx:584-593`

**Step 1: Update disconnect banner text**

In `droneai-studio/src/App.tsx`, find the disconnect banner (around line 585):

```typescript
<span>Claude disconnected</span>
```

Change to:

```typescript
<span>AI disconnected</span>
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 3: Verify no remaining user-visible "Blender" or "Claude" text**

Search for user-visible occurrences:

Run: `cd droneai-studio && grep -rn '".*[Bb]lender.*"\|".*[Cc]laude.*"' src/ --include='*.tsx' --include='*.ts' | grep -v '//\|/\*\|console\.\|invoke(\|import\|interface\|type\|\.current'`

Expected: No results (only comments, invoke calls, and internal code should remain — no user-facing strings)

**Step 4: Commit**

```bash
git add droneai-studio/src/App.tsx
git commit -m "feat: rename Claude disconnected to AI disconnected"
```

---

### Task 5: Add LoadingScreen CSS Styles

**Files:**
- Modify: `droneai-studio/src/globals.css`

**Step 1: Add loading screen styles**

Append the following CSS to the end of `droneai-studio/src/globals.css`. Use the `/frontend-design` skill to refine these styles for visual polish:

```css
/* ============================================================
   Loading Screen
   ============================================================ */
.loading-screen {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.loading-screen-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.5rem;
  max-width: 320px;
  width: 100%;
}

.loading-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.loading-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.loading-steps {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.loading-step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  transition: all 0.3s ease;
}

.loading-step--completed {
  border-color: rgba(var(--accent-rgb), 0.3);
}

.loading-step--error {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
}

.loading-step-indicator {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: loading-spin 0.8s linear infinite;
}

@keyframes loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.loading-step-content {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.loading-step-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
}

.loading-step--pending .loading-step-label {
  color: var(--text-secondary);
}

.loading-step-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loading-step-error-text {
  font-size: 0.6875rem;
  color: #ef4444;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-step-retry {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.25rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.loading-step-retry:hover {
  background: rgba(239, 68, 68, 0.25);
}
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add droneai-studio/src/globals.css
git commit -m "feat: add loading screen CSS styles"
```

---

### Task 6: Visual Polish with /frontend-design

**Files:**
- Modify: `droneai-studio/src/components/LoadingScreen.tsx`
- Modify: `droneai-studio/src/globals.css`

**Step 1: Use /frontend-design skill**

Invoke `/frontend-design` to refine the LoadingScreen visuals. Requirements to pass:

- Current component is at `droneai-studio/src/components/LoadingScreen.tsx`
- Current styles are at the bottom of `droneai-studio/src/globals.css` (`.loading-screen` section)
- Theme uses CSS variables: `--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--accent`, `--accent-rgb`, `--border`
- Must work in both dark and light modes (`[data-theme="light"]` overrides)
- Goal: make the loading experience feel polished, smooth, distinctive — not generic
- Keep the functional logic unchanged — only enhance visual presentation
- Consider: animated step transitions, subtle glow effects, staggered reveals, progress bar at bottom

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds

**Step 3: Verify dark and light modes both work**

Run: `cd droneai-studio && npm run tauri dev`
- Create a new project → should see LoadingScreen in dark mode
- Toggle theme in workspace → go back → create another → should see LoadingScreen in light mode

**Step 4: Commit**

```bash
git add droneai-studio/src/components/LoadingScreen.tsx droneai-studio/src/globals.css
git commit -m "feat: polish loading screen visuals"
```

---

### Task 7: Build Verification and E2E Test

**Step 1: Full build check**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds with zero errors

**Step 2: Verify no user-visible "Blender" or "Claude" text**

Run: `cd droneai-studio && grep -rn 'Blender\|Claude' src/ --include='*.tsx' --include='*.ts' | grep -v '//\|/\*\|console\.\|invoke(\|import\|interface\|type\s\|\.current\|listen(\|useRef\|useCallback\|useState\|const.*=\|\.ts:'`

Manually verify any remaining hits are internal code only, not user-facing strings.

**Step 3: E2E walkthrough**

Run: `cd droneai-studio && npm run tauri dev`

Test the full flow:
1. App opens → ProjectPicker shows
2. Create new project → LoadingScreen appears immediately
3. Steps animate: "Preparing workspace" → "Starting engine" → "Connecting AI"
4. All steps complete → auto-transitions to workspace
5. Chat works, viewport works
6. Go back to picker → open existing project → LoadingScreen again → workspace restored
7. Disconnect Claude (kill process) → workspace shows "AI disconnected" (NOT "Claude disconnected")

**Step 4: Commit if any fixes needed**

```bash
git add -u droneai-studio/src/
git commit -m "fix: loading screen adjustments from E2E testing"
```
