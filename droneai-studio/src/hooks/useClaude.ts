// droneai-studio/src/hooks/useClaude.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
}

interface AssistantMessage {
  content: ContentBlock[];
  stop_reason: string | null;
}

interface StreamEvent {
  type: string;
  subtype?: string;
  message?: AssistantMessage;
  result?: string;
  is_error?: boolean;
}

export interface UseClaude {
  sendMessage: (text: string) => Promise<void>;
  newChat: () => Promise<void>;
  isActive: boolean;
  streamedText: string;
  isToolRunning: boolean;
  currentTool: string;
}

export function useClaude(): UseClaude {
  const [isActive, setIsActive] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [isToolRunning, setIsToolRunning] = useState(false);
  const [currentTool, setCurrentTool] = useState("");
  const lastTextRef = useRef("");

  // Poll Claude status to stay in sync (LoadingScreen calls invoke directly)
  useEffect(() => {
    const check = async () => {
      try {
        const status = await invoke<string>("get_claude_status");
        setIsActive(status === "active");
      } catch {
        // ignore
      }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unlistenResponse = listen<string>("claude-response", (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.payload);

        if (data.type === "assistant" && data.message) {
          // Extract all text content from the message
          const texts = data.message.content
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text!)
            .join("");

          // Check for tool_use blocks
          const toolBlocks = data.message.content.filter(
            (b) => b.type === "tool_use"
          );
          if (toolBlocks.length > 0) {
            const latest = toolBlocks[toolBlocks.length - 1];
            setIsToolRunning(true);
            setCurrentTool(latest.name || "tool");
          }

          // Update streamed text if it changed (partial messages send cumulative content)
          if (texts && texts !== lastTextRef.current) {
            lastTextRef.current = texts;
            setStreamedText(texts);
          }

          // If stop_reason is set, the turn is complete
          if (data.message.stop_reason) {
            setIsToolRunning(false);
            setCurrentTool("");
          }
        } else if (data.type === "result") {
          // Turn fully complete
          setIsToolRunning(false);
          setCurrentTool("");
          // Use result text as final content if available
          if (data.result && data.result !== lastTextRef.current) {
            lastTextRef.current = data.result;
            setStreamedText(data.result);
          }
        }
        // Ignore system and rate_limit_event types
      } catch {
        // Non-JSON line, ignore
      }
    });

    const unlistenExited = listen("claude-exited", () => {
      setIsActive(false);
      setIsToolRunning(false);
      setCurrentTool("");
    });

    return () => {
      unlistenResponse.then((fn) => fn());
      unlistenExited.then((fn) => fn());
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    setStreamedText("");
    lastTextRef.current = "";
    setIsToolRunning(false);
    setCurrentTool("");
    await invoke("send_message", { message: text });
  }, []);

  const newChat = useCallback(async () => {
    await invoke("new_chat");
    setIsActive(true);
    setStreamedText("");
    lastTextRef.current = "";
  }, []);

  return { sendMessage, newChat, isActive, streamedText, isToolRunning, currentTool };
}
