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
