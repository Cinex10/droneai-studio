# Auto-Launch Loading Screen Design

**Date:** 2026-02-28
**Status:** Approved

## Summary

Remove the manual SetupScreen and replace it with an automatic LoadingScreen. When a user picks or creates a project, Blender and Claude launch in parallel behind a polished loading UI. No user interaction required — the app transitions to workspace automatically when ready. All references to "Blender" and "Claude" are removed from user-facing frontend text.

## Flow Change

**Before:** ProjectPicker → SetupScreen (manual "Connect" + "Start Designing") → Workspace
**After:** ProjectPicker → LoadingScreen (fully automatic) → Workspace

## LoadingScreen Behavior

On mount:
1. Call `launch_blender` and `new_chat` in parallel (both Tauri commands)
2. Poll both statuses every 1000ms
3. Display 3 animated progress steps:
   - **"Preparing workspace..."** — starts immediately, completes as visual baseline
   - **"Starting engine..."** — completes when `get_blender_status` returns `"running"`
   - **"Connecting AI..."** — completes when `get_claude_status` returns `"active"`
4. When all steps complete → auto-transition to workspace (no button)

On error:
- Failed step turns red with short error message and "Retry" button
- Retry re-invokes the failed Tauri command and resumes polling
- Other steps continue independently

## Loading Screen UI

- Full-screen centered layout matching app theme (`--bg-primary`)
- App logo + "DroneAI Studio" title at top
- 3 vertical steps with animated check/spinner/error indicators
- Smooth progress bar or step-by-step reveal animation
- Use `/frontend-design` skill for visual polish during implementation

## Remove "Blender"/"Claude" from Frontend

**User-visible text removed:**
- SetupScreen: "Blender 4.x", "Claude Code" labels → entire component deleted
- App.tsx line 585: "Claude disconnected" → "AI disconnected"

**Internal code (variable names, hooks, comments):** Unchanged — only user-facing strings are affected.

## Workspace Reconnection

The disconnect banner stays but reads "AI disconnected" with "Reconnect" button. Same `new_chat` flow internally.

## onReady Logic Migration

The current `SetupScreen.onReady` callback in App.tsx (lines 419-450) handles:
- `restore_chat` for existing projects
- `suppressStreamRef` management
- Scene/showInfo polling on entry

This logic moves into LoadingScreen's auto-transition handler or into App.tsx's screen transition effect. The behavior is identical — just triggered automatically instead of by button click.

## Stack Impact

| File | Change |
|------|--------|
| `SetupScreen.tsx` | **Delete** |
| `LoadingScreen.tsx` | **Create** — new auto-launch loading component |
| `App.tsx` | Replace `"setup"` screen with `"loading"`, move onReady logic, rename "Claude disconnected" to "AI disconnected" |
| `globals.css` | Add loading screen animations (step transitions, progress indicators) |
| `commands.rs` | No change |
| `useClaude.ts` | No change (internal naming stays) |
| `useBlender.ts` | No change |

## What's NOT in Scope

- Changing Rust backend launch commands
- Adding new Tauri IPC commands
- Modifying the ProjectPicker
- Changing workspace behavior after loading completes
