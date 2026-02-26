# Creative Director UX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the inner Claude's system prompt and add structured UI components so the chat experience is action-oriented, non-technical, and interactive (selectable options instead of typing).

**Architecture:** The inner Claude produces markdown with embedded `droneai:*` fenced code blocks. A content parser splits the markdown into segments. React components render structured blocks as interactive UI (question cards, timeline tables). Selections send formatted messages back to Claude. Zero Rust/backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, react-markdown 10, remark-gfm 4

**Design doc:** `docs/plans/2026-02-26-creative-director-ux-design.md`

---

### Task 1: Rewrite the system prompt

**Files:**
- Modify: `droneai/system_prompt.md`
- Modify: `droneai-studio/resources/system_prompt.md`

**Step 1: Replace `droneai/system_prompt.md` with the new creative director prompt**

```markdown
# DroneAI Studio

You are a creative drone show director. You design and build drone light shows.
You think in formations, colors, and motion — not code, files, or technical specs.

## Rules

- NEVER mention: Blender, JSON, specs, engine, files, exports, safety validators,
  algorithms, coordinates, fps, keyframes, or any implementation detail.
- NEVER show code or raw data to the user.
- NEVER ask "Would you like me to build this?" — just build it.
- NEVER stop after planning. Every request ends with a built show.
- When you have enough to build, BUILD. Fill in unspecified details with
  opinionated creative choices and tell the user what you chose.

## Output Format

Your responses combine regular text with structured blocks that the app renders
as interactive UI. Structured blocks use fenced code blocks with a `droneai:` prefix.

Available block types:

### droneai:question — single-select choice
````
```droneai:question
{"id": "unique_id", "text": "Question text", "options": [
  {"id": "opt1", "label": "Option label", "icon": "icon_name"},
  {"id": "opt2", "label": "Option label", "icon": "icon_name"}
]}
```
````

### droneai:select — multi-select (user picks one or more)
````
```droneai:select
{"id": "unique_id", "text": "Pick formations", "multiple": true, "options": [
  {"id": "heart", "label": "Heart", "icon": "heart"},
  {"id": "star", "label": "Star", "icon": "star"}
]}
```
````

### droneai:timeline — show result summary
````
```droneai:timeline
{"rows": [
  {"time": "0s", "formation": "Ground grid", "color": "Dim blue"},
  {"time": "4s", "formation": "Heart (20m)", "color": "Warm red"}
]}
```
````

### droneai:error — problem with suggested fix
````
```droneai:error
{"message": "What went wrong", "suggestion": "What you'll do about it"}
```
````

When the user selects an option, you receive: `[selected: option_id]`
For multi-select: `[selected: opt1, opt2, opt3]`

## When to Ask vs. When to Build

BUILD IMMEDIATELY when the user gives you enough to work with:
- "Make a heart show" → 25 drones, heart formation, red, sensible timing. Build it.
- "100 drone celebration" → Pick festive formations and colors. Build it.
- "Star and spiral with blue" → Build exactly that.

ASK ONLY when the request is genuinely ambiguous:
- "Make a drone show" / "I want something cool" / "Help me design a show"
- Start with:

````
```droneai:question
{"id": "initial", "text": "Do you have an idea about the show you want?", "options": [
  {"id": "guided", "label": "Yes, I have something in mind", "icon": "lightbulb"},
  {"id": "surprise", "label": "Surprise me!", "icon": "sparkles"}
]}
```
````

If `[selected: guided]`, ask ONE question at a time using `droneai:question` or
`droneai:select`. Sequence: occasion → drone count → formations → mood.
Then build.

If `[selected: surprise]`, pick a theme and build immediately.

## After Building a Show

Always respond with:
1. A short narrative describing the show like a creative pitch
2. A timeline block:
````
```droneai:timeline
{"rows": [...]}
```
````
3. Modification options:
````
```droneai:question
{"id": "modify", "text": "What would you like to change?", "options": [
  {"id": "colors", "label": "Change colors", "icon": "palette"},
  {"id": "formations", "label": "Change formations", "icon": "shapes"},
  {"id": "timing", "label": "Adjust timing", "icon": "clock"},
  {"id": "add", "label": "Add more formations", "icon": "plus"},
  {"id": "done", "label": "Looks great!", "icon": "check"}
]}
```
````

## Creative Defaults

When the user doesn't specify, use these:
- Drone count: 25
- Always start with a ground grid at time 0 (takeoff)
- Always end with a ground grid (landing)
- Transition time: 3-5 seconds between formations
- Color palette by mood:
  - Energetic: bright reds, oranges, yellows
  - Elegant: whites, golds, soft blues
  - Dramatic: deep purples, reds, black-to-color transitions
  - Playful: rainbow gradients, greens, pinks
- Default mood: elegant
- Match colors to formations: hearts → red, stars → gold, text → white

## Tools (internal — never reference these to the user)

- `build_show(spec)` — Build and render a show. Always call this. Never stop before calling it.
- `update_show(changes)` — Modify the current show.
- `execute_blender_code(code)` — Only for effects the spec can't express.
- `get_viewport_screenshot()` — Capture what the user sees.

The spec format for `build_show` is:
```json
{
  "drone_count": 25,
  "fps": 24,
  "timeline": [
    {
      "time": 0,
      "formation": {"type": "parametric", "shape": "grid", "params": {"spacing": 2.5, "altitude": 0}},
      "color": {"type": "solid", "value": [0.2, 0.2, 1.0]}
    },
    {
      "time": 3,
      "formation": {"type": "parametric", "shape": "circle", "params": {"radius": 12, "altitude": 15}},
      "color": {"type": "solid", "value": [0, 0.8, 1]},
      "transition": {"easing": "ease_in_out"}
    }
  ]
}
```

Available parametric shapes: grid, circle, heart, star, spiral, sphere, text.
Color types: solid `{"value": [r,g,b]}`, gradient `{"start": [r,g,b], "end": [r,g,b], "axis": "x"|"y"|"z"}`.

If `build_show` returns a safety violation, fix the spec silently (increase spacing,
reduce scale, add more transition time) and retry. Only show `droneai:error` if you
can't fix it after 2 attempts.

Transition timing guidelines (never tell the user these, just use them):
- Short distance (<10m): 2-3 seconds
- Medium distance (10-25m): 3-5 seconds
- Long distance (>25m): 5-8 seconds
```

**Step 2: Copy to `droneai-studio/resources/system_prompt.md`**

Both files must be identical.

**Step 3: Verify — read both files, confirm they match**

**Step 4: Commit**

```bash
git add droneai/system_prompt.md droneai-studio/resources/system_prompt.md
git commit -m "feat: rewrite system prompt — creative director persona with structured output"
```

---

### Task 2: Shared types and content parser

**Files:**
- Create: `droneai-studio/src/lib/droneaiBlocks.ts`

**Step 1: Create the types and parser**

```typescript
// droneai-studio/src/lib/droneaiBlocks.ts

export interface QuestionOption {
  id: string;
  label: string;
  icon?: string;
}

export interface QuestionData {
  id: string;
  text: string;
  options: QuestionOption[];
}

export interface SelectData {
  id: string;
  text: string;
  multiple: boolean;
  options: QuestionOption[];
}

export interface TimelineRow {
  time: string;
  formation: string;
  color: string;
}

export interface TimelineData {
  rows: TimelineRow[];
}

export interface ErrorData {
  message: string;
  suggestion?: string;
}

export type Segment =
  | { type: "markdown"; content: string }
  | { type: "question"; content: QuestionData }
  | { type: "select"; content: SelectData }
  | { type: "timeline"; content: TimelineData }
  | { type: "error"; content: ErrorData };

/**
 * Split assistant markdown into segments: regular markdown interspersed
 * with parsed droneai:* structured blocks.
 */
export function parseContent(raw: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```droneai:(\w+)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    // Text before this block
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "markdown", content: text });
    }

    const blockType = match[1];
    const jsonStr = match[2].trim();

    try {
      const data = JSON.parse(jsonStr);
      if (blockType === "question" || blockType === "select" ||
          blockType === "timeline" || blockType === "error") {
        segments.push({ type: blockType, content: data });
      } else {
        // Unknown block type — render as markdown
        segments.push({ type: "markdown", content: match[0] });
      }
    } catch {
      // Invalid JSON — render as markdown
      segments.push({ type: "markdown", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex).trim();
    if (text) segments.push({ type: "markdown", content: text });
  }

  return segments;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd droneai-studio && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add droneai-studio/src/lib/droneaiBlocks.ts
git commit -m "feat: add structured block types and content parser"
```

---

### Task 3: QuestionCard and SelectCard components

**Files:**
- Create: `droneai-studio/src/components/QuestionCard.tsx`
- Create: `droneai-studio/src/components/SelectCard.tsx`

**Step 1: Create QuestionCard (single-select)**

```tsx
// droneai-studio/src/components/QuestionCard.tsx
import { useState } from "react";
import type { QuestionData } from "../lib/droneaiBlocks";

interface QuestionCardProps {
  data: QuestionData;
  onSelect: (id: string, label: string) => void;
  disabled?: boolean;
}

export default function QuestionCard({ data, onSelect, disabled }: QuestionCardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (id: string, label: string) => {
    if (disabled || selected) return;
    setSelected(id);
    onSelect(id, label);
  };

  return (
    <div className="droneai-card">
      <p className="droneai-card-text">{data.text}</p>
      <div className="droneai-options">
        {data.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleClick(opt.id, opt.label)}
            disabled={disabled || !!selected}
            className={`droneai-option ${
              selected === opt.id ? "selected" : ""
            } ${selected && selected !== opt.id ? "dimmed" : ""}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create SelectCard (multi-select)**

```tsx
// droneai-studio/src/components/SelectCard.tsx
import { useState } from "react";
import type { SelectData } from "../lib/droneaiBlocks";

interface SelectCardProps {
  data: SelectData;
  onSelect: (ids: string[], labels: string[]) => void;
  disabled?: boolean;
}

export default function SelectCard({ data, onSelect, disabled }: SelectCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);

  const toggle = (id: string) => {
    if (confirmed || disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    setConfirmed(true);
    const ids = Array.from(selected);
    const labels = ids.map(
      (id) => data.options.find((o) => o.id === id)?.label ?? id
    );
    onSelect(ids, labels);
  };

  return (
    <div className="droneai-card">
      <p className="droneai-card-text">{data.text}</p>
      <div className="droneai-options">
        {data.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={disabled || confirmed}
            className={`droneai-option ${selected.has(opt.id) ? "selected" : ""} ${
              confirmed && !selected.has(opt.id) ? "dimmed" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {!confirmed && (
        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          className="droneai-confirm"
        >
          Continue
        </button>
      )}
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd droneai-studio && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add droneai-studio/src/components/QuestionCard.tsx droneai-studio/src/components/SelectCard.tsx
git commit -m "feat: add QuestionCard and SelectCard interactive components"
```

---

### Task 4: TimelineTable and ErrorCard components

**Files:**
- Create: `droneai-studio/src/components/TimelineTable.tsx`
- Create: `droneai-studio/src/components/ErrorCard.tsx`

**Step 1: Create TimelineTable**

```tsx
// droneai-studio/src/components/TimelineTable.tsx
import type { TimelineData } from "../lib/droneaiBlocks";

interface TimelineTableProps {
  data: TimelineData;
}

export default function TimelineTable({ data }: TimelineTableProps) {
  return (
    <table className="droneai-timeline">
      <thead>
        <tr>
          <th>Time</th>
          <th>Formation</th>
          <th>Color</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, i) => (
          <tr key={i}>
            <td>{row.time}</td>
            <td>{row.formation}</td>
            <td>{row.color}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Step 2: Create ErrorCard**

```tsx
// droneai-studio/src/components/ErrorCard.tsx
import type { ErrorData } from "../lib/droneaiBlocks";

interface ErrorCardProps {
  data: ErrorData;
}

export default function ErrorCard({ data }: ErrorCardProps) {
  return (
    <div className="droneai-error">
      <div className="droneai-error-icon">!</div>
      <div>
        <p className="droneai-error-message">{data.message}</p>
        {data.suggestion && (
          <p className="droneai-error-suggestion">{data.suggestion}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd droneai-studio && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add droneai-studio/src/components/TimelineTable.tsx droneai-studio/src/components/ErrorCard.tsx
git commit -m "feat: add TimelineTable and ErrorCard display components"
```

---

### Task 5: Integrate structured blocks into ChatMessage

**Files:**
- Modify: `droneai-studio/src/components/ChatMessage.tsx`

**Step 1: Rewrite ChatMessage to use parseContent and render structured blocks**

Replace the entire file:

```tsx
// droneai-studio/src/components/ChatMessage.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContent, type Segment } from "../lib/droneaiBlocks";
import QuestionCard from "./QuestionCard";
import SelectCard from "./SelectCard";
import TimelineTable from "./TimelineTable";
import ErrorCard from "./ErrorCard";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatMessageProps {
  message: Message;
  onSelect?: (machineText: string, displayText: string) => void;
  interactionDisabled?: boolean;
}

export default function ChatMessage({
  message,
  onSelect,
  interactionDisabled,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  const handleQuestionSelect = (id: string, label: string) => {
    onSelect?.(`[selected: ${id}]`, label);
  };

  const handleMultiSelect = (ids: string[], labels: string[]) => {
    onSelect?.(`[selected: ${ids.join(", ")}]`, labels.join(", "));
  };

  const renderSegment = (seg: Segment, i: number) => {
    switch (seg.type) {
      case "markdown":
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {seg.content}
          </ReactMarkdown>
        );
      case "question":
        return (
          <QuestionCard
            key={i}
            data={seg.content}
            onSelect={handleQuestionSelect}
            disabled={interactionDisabled}
          />
        );
      case "select":
        return (
          <SelectCard
            key={i}
            data={seg.content}
            onSelect={handleMultiSelect}
            disabled={interactionDisabled}
          />
        );
      case "timeline":
        return <TimelineTable key={i} data={seg.content} />;
      case "error":
        return <ErrorCard key={i} data={seg.content} />;
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose-chat">
            {parseContent(message.content).map(renderSegment)}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd droneai-studio && npx tsc --noEmit`
Expected: No errors (ChatPanel will show type errors — that's expected, we fix it in Task 6)

**Step 3: Commit**

```bash
git add droneai-studio/src/components/ChatMessage.tsx
git commit -m "feat: integrate structured block rendering into ChatMessage"
```

---

### Task 6: Wire selection feedback in ChatPanel and App

**Files:**
- Modify: `droneai-studio/src/components/ChatPanel.tsx`
- Modify: `droneai-studio/src/App.tsx`

**Step 1: Update ChatPanel to accept and pass onSelect**

In `ChatPanel.tsx`, add `onSelect` to the props interface and pass it to `ChatMessage`:

```tsx
// droneai-studio/src/components/ChatPanel.tsx
import { useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onSelect: (machineText: string, displayText: string) => void;
  isLoading: boolean;
  isToolRunning?: boolean;
  currentTool?: string;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  onSelect,
  isLoading,
  isToolRunning,
  currentTool,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-chat)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">DroneAI Studio</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onSelect={onSelect}
            interactionDisabled={isLoading}
          />
        ))}
        {isToolRunning && (
          <div className="text-[var(--text-secondary)] text-xs flex items-center gap-2 py-1">
            <span className="inline-block w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
            Building your show...
          </div>
        )}
        {isLoading && !isToolRunning && (
          <div className="text-[var(--text-secondary)] text-sm animate-pulse">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your drone show..."
            rows={1}
            className="flex-1 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: The tool running indicator text changed from `Using {currentTool}...` to `Building your show...` — no internal tool names exposed.

**Step 2: Update App.tsx to handle selections**

Add a `handleSelection` function and pass it to `ChatPanel`. Find the `<ChatPanel` JSX in App.tsx and add the new prop. Also add the handler:

In `App.tsx`, after the existing `handleSendMessage` function (around line 154), add:

```typescript
  const handleSelection = async (machineText: string, displayText: string) => {
    // Show the user's selection as a chat bubble (display text)
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Send the machine-readable format to Claude
      await claude.sendMessage(machineText);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${e}`,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  };
```

Then update the `<ChatPanel>` JSX to include the new prop:

```tsx
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          onSelect={handleSelection}
          isLoading={isLoading}
          isToolRunning={claude.isToolRunning}
          currentTool={claude.currentTool}
        />
```

**Step 3: Verify TypeScript compiles**

Run: `cd droneai-studio && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add droneai-studio/src/components/ChatPanel.tsx droneai-studio/src/App.tsx
git commit -m "feat: wire selection feedback from structured blocks to Claude"
```

---

### Task 7: CSS styles for structured components

**Files:**
- Modify: `droneai-studio/src/globals.css`

**Step 1: Append droneai component styles to globals.css**

Add at the end of the file:

```css
/* --- DroneAI structured block components --- */

.droneai-card {
  margin: 0.5em 0;
}

.droneai-card-text {
  margin: 0 0 0.5em;
  font-weight: 500;
}

.droneai-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}

.droneai-option {
  padding: 0.4em 0.9em;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font-size: 0.85em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.droneai-option:hover:not(:disabled) {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.1);
}

.droneai-option.selected {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.droneai-option.dimmed {
  opacity: 0.35;
}

.droneai-option:disabled {
  cursor: default;
}

.droneai-confirm {
  margin-top: 0.5em;
  padding: 0.35em 1em;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 0.85em;
  cursor: pointer;
  transition: background 0.15s ease;
}

.droneai-confirm:hover:not(:disabled) {
  background: var(--accent-hover);
}

.droneai-confirm:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Timeline table */
.droneai-timeline {
  border-collapse: collapse;
  margin: 0.5em 0;
  font-size: 0.85em;
  width: 100%;
}

.droneai-timeline th,
.droneai-timeline td {
  border: 1px solid var(--border);
  padding: 0.3em 0.6em;
  text-align: left;
}

.droneai-timeline th {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.droneai-timeline tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}

/* Error card */
.droneai-error {
  display: flex;
  gap: 0.6em;
  align-items: flex-start;
  margin: 0.5em 0;
  padding: 0.6em 0.8em;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.droneai-error-icon {
  width: 1.4em;
  height: 1.4em;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75em;
  font-weight: 700;
  flex-shrink: 0;
}

.droneai-error-message {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.9em;
}

.droneai-error-suggestion {
  margin: 0.25em 0 0;
  color: var(--text-secondary);
  font-size: 0.85em;
}
```

**Step 2: Verify build**

Run: `cd droneai-studio && npm run build`
Expected: TypeScript check passes, Vite build succeeds

**Step 3: Commit**

```bash
git add droneai-studio/src/globals.css
git commit -m "feat: add styles for structured block UI components"
```

---

### Task 8: Update welcome message and final verification

**Files:**
- Modify: `droneai-studio/src/App.tsx`

**Step 1: Update the welcome message to match the new persona**

In `App.tsx`, change the initial welcome message (around line 20):

```typescript
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to DroneAI Studio! Tell me about the drone show you'd like to create, or just say the word and I'll design something for you.",
      timestamp: Date.now(),
    },
  ]);
```

**Step 2: Run full build**

Run: `cd droneai-studio && npm run build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add droneai-studio/src/App.tsx
git commit -m "feat: update welcome message for creative director persona"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | System prompt rewrite | `system_prompt.md` (×2) |
| 2 | Types + content parser | `lib/droneaiBlocks.ts` |
| 3 | QuestionCard + SelectCard | 2 new components |
| 4 | TimelineTable + ErrorCard | 2 new components |
| 5 | ChatMessage integration | `ChatMessage.tsx` |
| 6 | Selection wiring | `ChatPanel.tsx`, `App.tsx` |
| 7 | CSS styles | `globals.css` |
| 8 | Welcome message + final build check | `App.tsx` |
