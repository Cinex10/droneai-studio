import { useState, useRef, useEffect } from "react";
import type { Message } from "../types";
import ChatMessage from "./ChatMessage";

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onSelect: (machineText: string, displayText: string) => void;
  isLoading: boolean;
  isToolRunning?: boolean;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  onSelect,
  isLoading,
  isToolRunning,
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
    <div className="flex flex-col h-full min-w-0 bg-[var(--bg-chat)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2.5 space-y-2.5 min-h-0">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onSelect={onSelect}
            interactionDisabled={isLoading}
          />
        ))}
        {isToolRunning && (
          <div className="text-[var(--text-secondary)] text-[11px] flex items-center gap-1.5 py-1">
            <span className="inline-block w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse" />
            Building your show...
          </div>
        )}
        {isLoading && !isToolRunning && (
          <div className="text-[var(--text-secondary)] text-[12px] animate-pulse">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — compact */}
      <div className="px-2 py-2 border-t border-[var(--border)] flex-shrink-0">
        <div className="flex gap-1.5 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your show..."
            rows={1}
            className="flex-1 min-w-0 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[13px] resize-none focus:outline-none focus:border-[var(--accent)] leading-snug"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="chat-send-btn"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
