import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ChatPanel from "./components/ChatPanel";
import DroneViewport from "./components/DroneViewport";
import TimelineBar from "./components/TimelineBar";
import SetupScreen from "./components/SetupScreen";
import { useClaude } from "./hooks/useClaude";
import { useSceneData } from "./hooks/useSceneData";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to DroneAI Studio! Tell me about the drone show you'd like to create, or just say the word and I'll design something for you.",
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [blenderRunning, setBlenderRunning] = useState(false);

  const [currentFrame, setCurrentFrame] = useState(0);
  const claude = useClaude();
  const { sceneData, refreshScene } = useSceneData();

  // Refresh scene data when tool use completes
  const prevToolRunning = useRef(false);
  useEffect(() => {
    if (prevToolRunning.current && !claude.isToolRunning) {
      // Delay slightly to let Blender finish processing
      setTimeout(() => refreshScene(), 500);
    }
    prevToolRunning.current = claude.isToolRunning;
  }, [claude.isToolRunning, refreshScene]);

  // Also poll scene data periodically while Claude is active (every 5s)
  useEffect(() => {
    if (!blenderRunning) return;
    const interval = setInterval(() => refreshScene(), 5000);
    return () => clearInterval(interval);
  }, [blenderRunning, refreshScene]);

  // Poll blender status
  useEffect(() => {
    if (!setupComplete) return;
    const interval = setInterval(async () => {
      try {
        const status = await invoke<string>("get_blender_status");
        setBlenderRunning(status === "running");
      } catch {
        setBlenderRunning(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [setupComplete]);

  // Collect streamed text into messages
  useEffect(() => {
    if (claude.streamedText) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.id.startsWith("stream-")) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: claude.streamedText },
          ];
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            role: "assistant",
            content: claude.streamedText,
            timestamp: Date.now(),
          },
        ];
      });
      setIsLoading(false);
    }
  }, [claude.streamedText]);

  // Show reconnect banner when Claude dies
  const handleReconnect = useCallback(async () => {
    try {
      await claude.newChat();
    } catch (e) {
      console.error("Failed to reconnect:", e);
    }
  }, [claude]);

  const handleSelection = async (machineText: string, displayText: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
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

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // /test — run a pre-built demo show without touching Claude
    if (text.trim() === "/test") {
      setIsLoading(true);
      try {
        const result = await invoke<string>("run_test_show");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result,
            timestamp: Date.now(),
          },
        ]);
        setTimeout(() => refreshScene(), 500);
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
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      await claude.sendMessage(text);
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

  if (!setupComplete) {
    return <SetupScreen onReady={() => setSetupComplete(true)} />;
  }

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      <div className="w-[380px] min-w-[300px] border-r border-[var(--border)] flex flex-col">
        {!claude.isActive && setupComplete && (
          <div className="px-4 py-2 bg-red-900/50 text-red-200 text-xs flex items-center justify-between">
            <span>Claude disconnected</span>
            <button
              onClick={handleReconnect}
              className="px-2 py-0.5 bg-red-700 rounded text-xs hover:bg-red-600"
            >
              Reconnect
            </button>
          </div>
        )}
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          onSelect={handleSelection}
          isLoading={isLoading}
          isToolRunning={claude.isToolRunning}
        />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1">
          <DroneViewport sceneData={sceneData} currentFrame={currentFrame} />
        </div>
        <div className="h-12 border-t border-[var(--border)]">
          <TimelineBar blenderRunning={blenderRunning} onFrameChange={setCurrentFrame} sceneData={sceneData} />
        </div>
      </div>
    </div>
  );
}

export default App;
