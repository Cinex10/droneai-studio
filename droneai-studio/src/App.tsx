import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Message } from "./types";
import ChatPanel from "./components/ChatPanel";
import DroneViewport from "./components/DroneViewport";
import { TimelinePanel } from "./components/Timeline";
import { useShowInfo } from "./hooks/useShowInfo";
import LoadingScreen from "./components/LoadingScreen";
import ProjectPicker from "./components/ProjectPicker";
import CloseDialog from "./components/CloseDialog";
import ViewportLoader from "./components/ViewportLoader";
import ShowStatsHUD from "./components/ShowStatsHUD";
import { useClaude } from "./hooks/useClaude";
import { useSceneData } from "./hooks/useSceneData";
import { useProject } from "./hooks/useProject";
import type { ProjectChatMessage } from "./hooks/useProject";
import { useTheme } from "./hooks/useTheme";

type Screen = "picker" | "loading" | "workspace";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to DroneAI Studio! Tell me about the drone show you'd like to create, or just say the word and I'll design something for you.",
  timestamp: Date.now(),
};

const CHAT_MIN = 220;
const CHAT_MAX = 520;
const CHAT_DEFAULT = 300;

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
  const suppressStreamRef = useRef(false);

  // --- Responsive sidebar state ---
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT);
  const [chatOpen, setChatOpen] = useState(true);
  const isDragging = useRef(false);

  const claude = useClaude();
  const { sceneData, refreshScene, clearScene } = useSceneData();
  const { showInfo, refreshShowInfo, clearShowInfo } = useShowInfo();
  const project = useProject();
  const { toggleTheme, isDark } = useTheme();

  // --- Clear restore loader once scene data arrives (or timeout) ---
  useEffect(() => {
    if (isRestoring && sceneData) {
      setIsRestoring(false);
    }
  }, [isRestoring, sceneData]);

  useEffect(() => {
    if (!isRestoring) return;
    const timeout = setTimeout(() => setIsRestoring(false), 8000);
    return () => clearTimeout(timeout);
  }, [isRestoring]);

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
    if (claude.streamedText && !suppressStreamRef.current) {
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
    clearScene();
    clearShowInfo();
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

  // --- Sidebar drag resize ---
  const handleSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startW = chatWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (ev: MouseEvent) => {
      const newW = startW + (ev.clientX - startX);
      setChatWidth(Math.max(CHAT_MIN, Math.min(CHAT_MAX, newW)));
    };
    const up = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, [chatWidth]);

  // --- Project picker actions ---
  const handleCreateProject = useCallback(
    async (name: string) => {
      await project.createProject(name);
      setMessages([WELCOME_MESSAGE]);
      clearScene();
      clearShowInfo();
      setIsExistingProject(false);
      setScreen("loading");
    },
    [project, clearScene, clearShowInfo],
  );

  const handleOpenProject = useCallback(
    async (id: string) => {
      const data = await project.openProject(id);
      // Restore chat messages if any
      if (data.chat && data.chat.length > 0) {
        setMessages(
          data.chat.map((m) => ({
            // Strip "stream-" prefix so restored messages aren't treated as
            // in-progress streams and overwritten by new streamed responses
            id: m.id.startsWith("stream-") ? `saved-${m.id}` : m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
      setIsExistingProject(data.chat.length > 0);
      setScreen("loading");
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
    suppressStreamRef.current = false;
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
    suppressStreamRef.current = false;
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

  if (screen === "loading") {
    return (
      <>
        <LoadingScreen
          onReady={async () => {
            if (isExistingProject) {
              try {
                suppressStreamRef.current = true;
                const chatForRestore: ProjectChatMessage[] = messages.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                }));
                await invoke("restore_chat", { messages: chatForRestore });
                setTimeout(() => { suppressStreamRef.current = false; }, 15000);
              } catch (e) {
                console.error("[App] Failed to restore chat:", e);
                suppressStreamRef.current = false;
              }
            } else {
              clearScene();
              clearShowInfo();
            }
            setIsRestoring(isExistingProject);
            setScreen("workspace");
            let attempts = 0;
            const poll = setInterval(async () => {
              attempts++;
              await refreshScene();
              await refreshShowInfo();
              if (attempts >= 5) clearInterval(poll);
            }, 2000);
          }}
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

  const effectiveChatWidth = chatOpen ? chatWidth : 0;

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-primary)] overflow-hidden">
      {/* Workspace header */}
      <div className="app-header">
        {/* Left: logo + actions */}
        <div className="app-header-left">
          <button onClick={handleBack} className="app-logo" title="Back to projects">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
              <circle cx="12" cy="8" r="2" fill="var(--accent)" />
              <circle cx="7" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
              <circle cx="17" cy="14" r="1.5" fill="var(--accent)" opacity="0.7" />
              <circle cx="12" cy="17" r="1.2" fill="var(--accent)" opacity="0.4" />
            </svg>
          </button>
          <div className="app-header-divider" />
          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            title={chatOpen ? "Hide chat" : "Show chat"}
            className={`app-header-icon ${chatOpen ? "active" : ""}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!project.isDirty}
            className="app-header-icon"
            title="Save (⌘S)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        </div>

        {/* Center: breadcrumb + project name */}
        <div className="app-header-center">
          <button className="app-header-breadcrumb" onClick={handleBack} title="Back to projects">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="app-header-breadcrumb-text">Projects</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <span className="app-header-project">
            {project.currentProject?.name ?? "Untitled"}
            {project.isDirty && (
              <span className="app-header-dirty">*</span>
            )}
          </span>
        </div>

        {/* Right: actions */}
        <div className="app-header-right">
          {/* Export */}
          <button className="app-header-export" title="Export show">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Export
          </button>

          <div className="app-header-divider" />

          {/* Theme toggle */}
          <button
            className="app-header-icon"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {isDark ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Info */}
          <button className="app-header-icon" title="Info">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>

          {/* Profile avatar (mock) */}
          <div className="app-header-avatar" title="Profile">
            <span>U</span>
          </div>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat sidebar */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden border-r border-[var(--border)]"
          style={{
            width: effectiveChatWidth,
            transition: isDragging.current ? "none" : "width 0.2s ease",
          }}
        >
          {chatOpen && (
            <>
              {!claude.isActive && (
                <div className="px-3 py-1.5 bg-red-900/40 text-red-300 text-[11px] flex items-center justify-between flex-shrink-0">
                  <span>Claude disconnected</span>
                  <button
                    onClick={handleReconnect}
                    className="px-2 py-0.5 bg-red-800/60 rounded text-[10px] hover:bg-red-700/60"
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
            </>
          )}
        </div>

        {/* Drag handle */}
        {chatOpen && (
          <div
            className="sidebar-drag-handle"
            onMouseDown={handleSidebarDrag}
          />
        )}

        {/* Right side: Viewport + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 relative min-h-0">
            <DroneViewport sceneData={sceneData} currentFrame={currentFrame} isDark={isDark} />
            <ShowStatsHUD sceneData={sceneData} showInfo={showInfo} />
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
