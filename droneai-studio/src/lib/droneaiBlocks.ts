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
        segments.push({ type: "markdown", content: match[0] });
      }
    } catch {
      segments.push({ type: "markdown", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex).trim();
    if (text) segments.push({ type: "markdown", content: text });
  }

  return segments;
}
