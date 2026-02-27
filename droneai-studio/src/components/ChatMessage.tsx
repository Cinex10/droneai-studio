import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContent, type Segment } from "../lib/droneaiBlocks";
import type { Message } from "../types";
import QuestionCard from "./QuestionCard";
import SelectCard from "./SelectCard";
import TimelineTable from "./TimelineTable";
import ErrorCard from "./ErrorCard";

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
  const segments = useMemo(
    () => (isUser ? [] : parseContent(message.content)),
    [message.content, isUser]
  );

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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} min-w-0`}>
      <div
        className={`max-w-full rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed min-w-0 ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose-chat">
            {segments.map(renderSegment)}
          </div>
        )}
      </div>
    </div>
  );
}
