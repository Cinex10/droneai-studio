import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Message } from "./types";
import ChatPanel from "./components/ChatPanel";
import DroneViewport from "./components/DroneViewport";
import { TimelinePanel } from "./components/Timeline";
import { useShowInfo } from "./hooks/useShowInfo";
import SetupScreen from "./components/SetupScreen";
import ProjectPicker from "./components/ProjectPicker";
import CloseDialog from "./components/CloseDialog";
import ViewportLoader from "./components/ViewportLoader";
import { useClaude } from "./hooks/useClaude";
import { useSceneData } from "./hooks/useSceneData";
import { useProject } from "./hooks/useProject";
import type { ProjectChatMessage } from "./hooks/useProject";

type Screen = "picker" | "setup" | "workspace";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to DroneAI Studio! Tell me about the drone show you'd like to create, or just say the word and I'll design something for you.",
  timestamp: Date.now(),
};

function App() {
  const [screen, setScreen] = useState<Screen>("picker");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [blenderRunning, setBlenderRunning] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "close" | "back" | null
  >(null);
  const [isExistingProject, setIsExistingProject] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const claude = useClaude();
  const { sceneData, refreshScene } = useSceneData();
  const { showInfo, refreshShowInfo } = useShowInfo();
  const project = useProject();

  // --- Clear restore loader once scene has drones ---
  useEffect(() => {
    if (isRestoring && sceneData?.drones && sceneData.drones.length > 0) {
      setIsRestoring(false);
    }
  }, [isRestoring, sceneData]);

  // --- Dirty tracking ---
  const markDirtyRef = useRef(project.markDirty);
  markDirtyRef.current = project.markDirty;

  // --- Scene refresh on tool completion ---
  const prevToolRunning = useRef(false);
  useEffect(() => {
    if (prevToolRunning.current && !claude.isToolRunning) {
      setTimeout(() => {
        refreshScene();
        refreshShowInfo();
      }, 500);
    }
    prevToolRunning.current = claude.isToolRunning;
  }, [claude.isToolRunning, refreshScene, refreshShowInfo]);

  // Poll scene data periodically
  useEffect(() => {
    if (!blenderRunning) return;
    const interval = setInterval(() => refreshScene(), 5000);
    return () => clearInterval(interval);
  }, [blenderRunning, refreshScene]);

  // Poll blender status
  useEffect(() => {
    if (screen !== "workspace") return;
    const interval = setInterval(async () => {
      try {
        const status = await invoke<string>("get_blender_status");
        setBlenderRunning(status === "running");
      } catch {
        setBlenderRunning(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [screen]);

  // --- Collect streamed text into messages + mark dirty ---
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
      markDirtyRef.current();
    }
  }, [claude.streamedText]);

  // --- Tauri close-requested event ---
  useEffect(() => {
    const unlisten = listen("close-requested", () => {
      if (project.isDirty) {
        setPendingAction("close");
        setShowCloseDialog(true);
      } else {
        project.forceClose();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [project.isDirty, project.forceClose]);

  // --- Cmd+S save shortcut ---
  useEffect(() => {
    if (screen !== "workspace") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!project.currentProject) return;
    try {
      const chatMessages: ProjectChatMessage[] = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      await project.saveProject(chatMessages);
    } catch (e) {
      console.error("Failed to save project:", e);
    }
  }, [messages, project]);

  // --- Close dialog actions ---
  const handleCloseSave = useCallback(async () => {
    setShowCloseDialog(false);
    await handleSave();
    if (pendingAction === "close") {
      project.forceClose();
    } else if (pendingAction === "back") {
      setScreen("picker");
      resetWorkspace();
    }
    setPendingAction(null);
  }, [handleSave, pendingAction, project]);

  const handleCloseDiscard = useCallback(() => {
    setShowCloseDialog(false);
    if (pendingAction === "close") {
      project.forceClose();
    } else if (pendingAction === "back") {
      setScreen("picker");
      resetWorkspace();
    }
    setPendingAction(null);
  }, [pendingAction, project]);

  const handleCloseCancel = useCallback(() => {
    setShowCloseDialog(false);
    setPendingAction(null);
  }, []);

  const resetWorkspace = () => {
    setMessages([WELCOME_MESSAGE]);
    setIsLoading(false);
    setBlenderRunning(false);
    setCurrentFrame(0);
    setIsExistingProject(false);
    setIsRestoring(false);
  };

  // --- Back to picker ---
  const handleBack = useCallback(() => {
    if (project.isDirty) {
      setPendingAction("back");
      setShowCloseDialog(true);
    } else {
      setScreen("picker");
      resetWorkspace();
    }
  }, [project.isDirty]);

  // --- Reconnect ---
  const handleReconnect = useCallback(async () => {
    try {
      await claude.newChat();
    } catch (e) {
      console.error("Failed to reconnect:", e);
    }
  }, [claude]);

  // --- Project picker actions ---
  const handleCreateProject = useCallback(
    async (name: string) => {
      await project.createProject(name);
      setIsExistingProject(false);
      setScreen("setup");
    },
    [project],
  );

  const handleOpenProject = useCallback(
    async (id: string) => {
      const data = await project.openProject(id);
      // Restore chat messages if any
      if (data.chat && data.chat.length > 0) {
        setMessages(
          data.chat.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
      setIsExistingProject(data.chat.length > 0);
      setScreen("setup");
    },
    [project],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await project.deleteProject(id);
    },
    [project],
  );

  // --- Chat actions ---
  const handleSelection = async (machineText: string, displayText: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    project.markDirty();

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
    project.markDirty();

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

  // --- Routing ---
  if (screen === "picker") {
    return (
      <>
        <ProjectPicker
          onOpen={handleOpenProject}
          onCreate={handleCreateProject}
          onDelete={handleDeleteProject}
          listProjects={project.listProjects}
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

  if (screen === "setup") {
    return (
      <SetupScreen
        onReady={async () => {
          if (isExistingProject) {
            // Scene restore is handled by launch_blender — it passes the
            // saved .blend file to Blender's CLI so it loads natively on
            // startup (no crash-prone bpy.ops.wm.open_mainfile via MCP).
            // Restore Claude conversation context
            try {
              const chatForRestore: ProjectChatMessage[] = messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              }));
              await invoke("restore_chat", { messages: chatForRestore });
              console.log("[App] restore_chat: sent", chatForRestore.length, "messages");
            } catch (e) {
              console.error("[App] Failed to restore chat:", e);
            }
          }
          setIsRestoring(true);
          setScreen("workspace");
          // Refresh viewport — retry until drones appear or timeout
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            await refreshScene();
            if (attempts >= 5) clearInterval(poll);
          }, 2000);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-primary)]">
      {/* Workspace header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            &larr; Projects
          </button>
          <span className="text-sm text-[var(--text-primary)] font-medium">
            {project.currentProject?.name ?? "Untitled"}
            {project.isDirty && (
              <span className="text-[var(--text-secondary)] ml-0.5">*</span>
            )}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!project.isDirty}
          className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-30 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-secondary)] transition-colors"
        >
          Save
        </button>
      </div>

      {/* Main workspace */}
      <div className="flex flex-1 min-h-0">
        <div className="w-[380px] min-w-[300px] border-r border-[var(--border)] flex flex-col">
          {!claude.isActive && screen === "workspace" && (
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
          <div className="flex-1 relative">
            <DroneViewport sceneData={sceneData} currentFrame={currentFrame} />
            <ViewportLoader visible={isRestoring} />
          </div>
          <TimelinePanel
            sceneData={sceneData}
            showInfo={showInfo}
            blenderRunning={blenderRunning}
            onFrameChange={setCurrentFrame}
          />
        </div>
      </div>

      {/* Close dialog */}
      {showCloseDialog && (
        <CloseDialog
          onSave={handleCloseSave}
          onDiscard={handleCloseDiscard}
          onCancel={handleCloseCancel}
        />
      )}
    </div>
  );
}

export default App;
