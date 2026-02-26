# Creative Director UX — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Branch:** feature/show-spec-driven

## Problem

The inner Claude (inside droneai-studio) behaves like a generic Claude Code developer
assistant. It generates specs and stops, exposes technical internals (JSON, Blender,
algorithms), and asks permission instead of acting. The end user interacts via a chat
panel — they expect a creative assistant that just builds their show.

## Design Decisions

- **Persona:** Creative director with a dash of one-shot executor. Opinionated defaults,
  builds immediately, narrates creative choices. Never asks permission to build.
- **Output to user:** Narrative description + visual timeline table. No safety metrics,
  no technical details. The 3D viewport shows the actual result.
- **When to ask questions:** Only when the request is genuinely ambiguous. Questions are
  structured (selectable options), never free-text. One question at a time.
- **Structured output:** `droneai:*` fenced code blocks with JSON payloads inside
  Claude's markdown. The frontend parses these and renders interactive UI components.
  Zero backend/Rust changes needed.

## Structured Block Protocol

The inner Claude produces markdown with embedded structured blocks. The frontend detects
fenced code blocks with `droneai:` language prefix, parses the JSON, and renders them
as React components. Regular text between blocks renders as markdown.

### Block Types

**`droneai:question`** — Single-select choice

```json
{
  "id": "unique_id",
  "text": "Question text",
  "options": [
    {"id": "opt1", "label": "Option label", "icon": "icon_name"},
    {"id": "opt2", "label": "Option label", "icon": "icon_name"}
  ]
}
```

**`droneai:select`** — Multi-select (user picks one or more)

```json
{
  "id": "unique_id",
  "text": "Pick formations",
  "multiple": true,
  "options": [
    {"id": "heart", "label": "Heart", "icon": "heart"},
    {"id": "star", "label": "Star", "icon": "star"}
  ]
}
```

**`droneai:timeline`** — Show result summary table

```json
{
  "rows": [
    {"time": "0s", "formation": "Ground grid", "color": "Dim blue"},
    {"time": "4s", "formation": "Heart (20m)", "color": "Warm red"}
  ]
}
```

**`droneai:error`** — Problem with suggested fix

```json
{
  "message": "What went wrong",
  "suggestion": "What the assistant will do about it"
}
```

### Selection Feedback

When the user clicks an option, the app sends a user message:
- Single-select: `[selected: option_id]`
- Multi-select: `[selected: opt1, opt2, opt3]`

The user bubble displays the human-readable labels, not the IDs.

## Interaction Flow

```
User sends message
  |
  +-- Request is clear enough? (e.g. "heart show with 25 drones")
  |   YES -> Build immediately with creative defaults, present result
  |
  +-- Request is ambiguous? (e.g. "make a drone show")
  |   -> droneai:question "Do you have an idea about the show you want?"
  |       [guided]  -> Question sequence (one at a time, all selectable):
  |                    occasion -> drone count -> formations -> mood
  |                    Then build.
  |       [surprise] -> Pick theme, build immediately
  |
  +-- After any show is built:
      Narrative + droneai:timeline + droneai:question for modifications
      [colors, formations, timing, add more, looks great]
```

## System Prompt

The system prompt defines the inner Claude's behavior. Key shifts from current:

1. **Behavioral rules first** — what NOT to do (never mention Blender, JSON, etc.)
2. **"Just build it" mandate** — questions are the exception, not the default
3. **Structured blocks are primary output** — not free-form markdown
4. **Creative defaults** — opinionated choices so it doesn't need to ask
5. **Tools are hidden** — user never knows they exist

### Forbidden Terms

Never mention to the user: Blender, JSON, spec, engine, export, file, safety validator,
algorithm, Hungarian, coordinates, fps, keyframes, bpy, Python, script, code, MCP, tool.

### Creative Defaults

- Drone count: 25 (when unspecified)
- Always start/end with ground grid (takeoff/landing)
- Transition time: 3-5 seconds between formations
- Color palettes by mood:
  - Energetic: bright reds, oranges, yellows
  - Elegant: whites, golds, soft blues
  - Dramatic: deep purples, reds, black-to-color transitions
  - Playful: rainbow gradients, greens, pinks
- Default mood: elegant
- Formation-color pairing: hearts=red, stars=gold, text=white

### Safety Handling

If `build_show` returns a safety violation, the inner Claude fixes the spec silently
and retries. Only shows `droneai:error` if it can't fix it after 2 attempts.

## Frontend Changes

### Custom Markdown Renderer

`ChatMessage.tsx` gets a custom `code` component for ReactMarkdown that intercepts
`droneai:*` language tags and renders the corresponding React component.

### New React Components

| Component | Purpose |
|-----------|---------|
| `QuestionCard` | Single-select: question text + clickable option pills |
| `SelectCard` | Multi-select: toggleable options + "Continue" button |
| `TimelineTable` | Show timeline: time, formation, color (with swatches) |
| `ErrorCard` | Warning message + suggestion text |

All components use the existing dark theme CSS variables.

### Selection Handling

When user clicks an option:
1. Component calls `onSelect(optionIds)` callback
2. Parent sends `[selected: ids]` as user message via `useClaude.sendMessage()`
3. User bubble shows human-readable labels
4. Selected options become disabled/highlighted

### Files Touched

| File | Change |
|------|--------|
| `ChatMessage.tsx` | Custom `code` renderer for ReactMarkdown |
| `QuestionCard.tsx` | New component |
| `SelectCard.tsx` | New component |
| `TimelineTable.tsx` | New component |
| `ErrorCard.tsx` | New component |
| `App.tsx` or `ChatPanel.tsx` | Wire selection callbacks |
| `globals.css` | Styles for new components |
| `system_prompt.md` (both copies) | Full rewrite |

No changes to: `useClaude.ts`, `claude_code.rs`, `commands.rs`, `server.py`.
