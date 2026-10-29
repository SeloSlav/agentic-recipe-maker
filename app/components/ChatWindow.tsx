"use client";

import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useCallback,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperclip, faCamera, faArrowUp, faArrowDown, faImage, faMagicWandSparkles, faUpload, faFileUpload, faClock, faMicrophone, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { ChatMessages } from "./ChatMessages";
import type { Message, NutritionalInfo } from "./types";
import { getAuth, onAuthStateChanged } from "../lib/backend/auth";
import { getDatabase, doc, getDoc } from "../lib/backend/database";
import { ImageUploadPopup } from "./ImageUploadPopup";
import { DrawImagePopup } from "./DrawImagePopup";
import { LoadingSpinner } from "./LoadingSpinner";
import { SendButtonSpinner } from "./SendButtonSpinner";
import { usePoints } from '../context/PointsContext';
import { TimerPopup } from "./TimerPopup";
import { VoiceRecordPopup } from "./VoiceRecordPopup";
import { BabaHelpPopup } from "./BabaHelpPopup";

interface ChatWindowProps {
  isSidebarOpen: boolean;
  chatId?: string | null;
  plan?: "free" | "pro";
  onChatIdChange?: (id: string | null) => void;
  onChatsChange?: () => void;
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const { auth } = await import("../lib/backend/client");
  const user = auth?.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getSessionToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export const ChatWindow = forwardRef(
  ({ isSidebarOpen, chatId = null, plan = "free", onChatIdChange, onChatsChange }: ChatWindowProps, ref) => {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [message, setMessage] = useState<string>("");
    const [messages, setMessages] = useState<Message[]>([
      { role: "assistant", content: "Hello, dear! I'm your Balkan recipe companion—ask me for accurate recipes, cooking tips, or anything. No generic bot nonsense, I promise." },
    ]);
    const [loading, setLoading] = useState<boolean>(false);
    const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
    const [mealPlanProgress, setMealPlanProgress] = useState<{
      recipeIndex: number;
      totalRecipes: number;
      recipeName: string;
      dayName: string;
      completedDays: number;
      timeSlot: string;
    } | null>(null);
    const [windowWidth, setWindowWidth] = useState<number | null>(null);
    const [translateY, setTranslateY] = useState(0);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // local backend state
    const [preferredCookingOil, setPreferredCookingOil] = useState<string | null>(null);
    const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);

    // Modal state for our new ImageUploadPopup
    const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);

    // Add new state for draw image popup
    const [isDrawImageOpen, setIsDrawImageOpen] = useState(false);

    // Add new state for timer popup
    const [isTimerOpen, setIsTimerOpen] = useState(false);

    // Add new state for voice recording popup
    const [isVoiceRecordOpen, setIsVoiceRecordOpen] = useState(false);

    // Help popup - what Baba can do
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const { showPointsToast } = usePoints();

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        inputRef.current?.focus();
      },
      inputRef, // Expose inputRef for setting the value
    }));

    // Load chat when chatId changes
    useEffect(() => {
      if (!chatId || !onChatIdChange) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await fetchWithAuth(`/api/chats/${chatId}`);
          if (!res.ok || cancelled) return;
          const data = await res.json();
          const msgs = Array.isArray(data.messages) ? data.messages : [];
          setMessages(msgs.length > 0 ? msgs : [{ role: "assistant", content: "Hello, dear! I'm your Balkan recipe companion—ask me for accurate recipes, cooking tips, or anything. No generic bot nonsense, I promise." }]);
        } catch {
          if (!cancelled) setMessages([{ role: "assistant", content: "Hello, dear! I'm your Balkan recipe companion—ask me for accurate recipes, cooking tips, or anything. No generic bot nonsense, I promise." }]);
        }
      })();
      return () => { cancelled = true; };
    }, [chatId]);

    // Reset to new chat when chatId becomes null
    useEffect(() => {
      if (chatId === null && onChatIdChange) {
        setMessages([{ role: "assistant", content: "Hello, dear! I'm your Balkan recipe companion—ask me for accurate recipes, cooking tips, or anything. No generic bot nonsense, I promise." }]);
      }
    }, [chatId]);

    // Debounced save when messages change (only when chatId is set)
    const saveTimeoutRef = useRef<NodeJS.Timeout>();
    const saveChat = useCallback(async (msgs: Message[], id: string, title?: string) => {
      try {
        await fetchWithAuth(`/api/chats/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs, ...(title && { title }) }),
        });
        onChatsChange?.();
      } catch (e) {
        console.error("Error saving chat:", e);
      }
    }, [onChatsChange]);

    useEffect(() => {
      if (!chatId || messages.length <= 1 || !onChatIdChange) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const firstUserContent = messages.find((m) => m.role === "user")?.content;
        const title = (typeof firstUserContent === "string" ? firstUserContent.slice(0, 50) : null) || "New Chat";
        saveChat(messages, chatId, title);
      }, 1500);
      return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      };
    }, [chatId, messages, saveChat, onChatIdChange]);

    useEffect(() => {
      const fetchUserPreferences = async () => {
        const auth = getAuth();
        const database = getDatabase();

        onAuthStateChanged(auth, async (user) => {
          if (user) {
            try {
              const userDocRef = doc(database, "users", user.uid);
              // console.log("Current User ID:", user.uid); // Log the user ID
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                const data = userDoc.data();
                // console.log("Fetched user preferences:", data);
                setPreferredCookingOil(data?.preferredCookingOil || "olive oil");
                setDietaryPreferences(data?.dietaryPreferences || []);
              } else {
                console.warn("User preferences document does not exist.");
                setPreferredCookingOil("olive oil");
                setDietaryPreferences([]);
              }
            } catch (error) {
              console.error("Error fetching user preferences:", error);
              setPreferredCookingOil("olive oil");
              setDietaryPreferences([]);
            }
          } else {
            setPreferredCookingOil("olive oil");
            setDietaryPreferences([]);
          }
        });
      };

      fetchUserPreferences();
    }, []);

    useEffect(() => {
      const handleResize = () => {
        if (typeof window !== "undefined") {
          setWindowWidth(window.innerWidth);
        }
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
      const container = messagesContainerRef.current;
      if (!container || windowWidth === null || windowWidth >= 768) return;

      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShowScrollButton(!isNearBottom);
      };

      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }, [windowWidth]);

    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    };

    const sendMessage = async (msg: string) => {
      const trimmedMessage = msg.trim();
      if (trimmedMessage === "") return;

      // If no chat yet, create one first (for chat history persistence)
      let currentChatId = chatId;
      if (!currentChatId && onChatIdChange) {
        try {
          const createRes = await fetchWithAuth("/api/chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: trimmedMessage.slice(0, 50) || "New Chat",
              messages: [...messages, { role: "user", content: trimmedMessage }],
            }),
          });
          if (createRes.ok) {
            const { id } = await createRes.json();
            currentChatId = id;
            onChatIdChange(id);
          }
        } catch (e) {
          console.error("Error creating chat:", e);
        }
      }

      // Add user's message to the conversation
      const updatedMessages: Message[] = [
        ...messages,
        { role: "user", content: trimmedMessage },
      ];
      setMessages(updatedMessages);
      setMessage("");

      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      setLoading(true);

      try {
        const auth = getAuth();
        const userId = auth.currentUser?.uid;
        // console.log("Current user ID:", userId); // Log the user ID

        const requestBody = {
          messages: updatedMessages,
          preferredCookingOil,
          dietaryPreferences,
          userId
        };
        // console.log("Sending request with body:", requestBody); // Log the request body

        const token = auth?.currentUser ? await auth.currentUser.getSessionToken() : null;
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify(requestBody),
        });

        const contentType = response.headers.get("Content-Type") || "";
        const isStream = contentType.includes("application/x-ndjson");

        if (isStream && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let doneEvent: { assistantMessage?: string; pointsAwarded?: { points: number; message: string }; timerSeconds?: number; recipeLinks?: { name: string; recipeId: string; url: string }[] } | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                if (event.type === "tool_started" && event.tool === "generate_meal_plan") {
                  setIsGeneratingMealPlan(true);
                  setMealPlanProgress(null);
                } else if (event.type === "meal_plan_progress") {
                  setMealPlanProgress({
                    recipeIndex: event.recipeIndex,
                    totalRecipes: event.totalRecipes,
                    recipeName: event.recipeName,
                    dayName: event.dayName,
                    completedDays: event.completedDays,
                    timeSlot: event.timeSlot,
                  });
                } else if (event.type === "done") {
                  doneEvent = event;
                } else if (event.type === "error") {
                  throw new Error(event.error || "Server error");
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }

          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer);
              if (event.type === "done") doneEvent = event;
            } catch {
              // ignore
            }
          }

          setIsGeneratingMealPlan(false);
          setMealPlanProgress(null);
          if (doneEvent?.assistantMessage) {
            setMessages((prev) => {
              const msg: Message = { role: "assistant", content: doneEvent!.assistantMessage! };
              if (doneEvent!.recipeLinks?.length) msg.recipeLinks = doneEvent!.recipeLinks;
              const next: Message[] = [...prev, msg];
              if (doneEvent!.timerSeconds != null && doneEvent!.timerSeconds > 0) {
                next.push({ role: "assistant", content: `TIMER_REQUEST_${doneEvent!.timerSeconds}` });
              }
              return next;
            });
            if (doneEvent.pointsAwarded) {
              showPointsToast(doneEvent.pointsAwarded.points, doneEvent.pointsAwarded.message);
            }
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Ah, my head! It's like I've been up all night making sarma for a village wedding. Try refreshing the page, darling—I'll do better next time!." },
            ]);
          }
        } else {
          const text = await response.text();
          let data: { assistantMessage?: string; pointsAwarded?: { points: number; message: string }; timerSeconds?: number; error?: string };
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            console.error("Chat API returned non-JSON:", text?.slice(0, 200));
            throw new Error("Server returned an invalid response. Please try again.");
          }

          if (data.assistantMessage) {
            setMessages((prev) => {
              const next: Message[] = [...prev, { role: "assistant", content: data!.assistantMessage! }];
              if (data!.timerSeconds != null && data!.timerSeconds > 0) {
                next.push({ role: "assistant", content: `TIMER_REQUEST_${data!.timerSeconds}` });
              }
              return next;
            });
            if (data.pointsAwarded) {
              showPointsToast(data.pointsAwarded.points, data.pointsAwarded.message);
            }
          } else if (data.error) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Oh dear, something went wrong: ${data.error}. Try again in a moment, darling!` },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Ah, my head! It's like I've been up all night making sarma for a village wedding. Try refreshing the page, darling—I'll do better next time!." },
            ]);
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: Unable to get response." },
        ]);
      } finally {
        setLoading(false);
        setIsGeneratingMealPlan(false);
        setMealPlanProgress(null);
      }
    };

    const onSuggestionClick = (suggestion: string) => {
      sendMessage(suggestion);
    };

    const onAssistantResponse = (
      assistantMsg: string | NutritionalInfo,
      recipeLinks?: { name: string; recipeId: string; url: string }[]
    ) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMsg, ...(recipeLinks?.length && { recipeLinks }) },
      ]);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMessage(e.target.value);
      const textarea = e.target;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(message);
      }
    };

    const sidebarMarginClass =
      isSidebarOpen && windowWidth !== null && windowWidth >= 768
        ? "ml-0"
        : "ml-0";

    // Base bottom padding for the messages container (enough for input)
    // Add extra padding equal to the keyboard offset to ensure messages are never hidden.
    const bottomPadding = windowWidth !== null && windowWidth < 768 ? 175 : 0; // base padding (enough space for input)

    // Submit callback for our image popup
    const handleImageSubmit = async (file: File | null) => {
      if (file) {
        setLoading(true);
        try {
          // Create a URL for the image preview
          const imagePreview = URL.createObjectURL(file);

          // Add the user's message with image preview
          setMessages(prev => [
            ...prev,
            {
              role: 'user',
              content: 'Baba, look at this picture I took! What do you think?',
              imageUrl: imagePreview // Add the image URL to the message
            }
          ]);

          // Create a FormData object to send the file
          const formData = new FormData();
          formData.append('image', file);

          const response = await fetch('/api/analyzeImage', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();

          if (response.ok) {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: data.analysis }
            ]);
          } else {
            console.error('API Error:', data);
            const errorMessage = data.details
              ? `Sorry dear, something went wrong: ${data.details}`
              : 'Sorry dear, I had trouble analyzing that image. Could you try uploading it again?';

            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: errorMessage }
            ]);
          }
        } catch (error) {
          console.error('Error analyzing image:', error);
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: 'Oh dear, something went wrong while analyzing the image. Could you try again?' }
          ]);
        } finally {
          setLoading(false);
        }
      }
    };

    const handleInputFocus = () => {
      setIsInputFocused(true);
    };

    const handleInputBlur = () => {
      setIsInputFocused(false);
    };

    // Add handler for draw image submit
    const handleDrawImageSubmit = async (prompt: string, userId: string | null, drawingId: string) => {
      setLoading(true);
      try {
        const response = await fetch('/api/drawImage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            userId,
            recipeId: drawingId
          }),
        });

        const data = await response.json();

        if (response.ok) {
          // Add user's prompt to the conversation
          setMessages(prev => [
            ...prev,
            { role: 'user', content: `Draw this for me: ${prompt}` }
          ]);

          // Add Baba's response with the generated image
          const babaResponse = `Here's what I drew for you, dear!\n\n![Generated Image](${data.imageUrl})`;

          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: babaResponse }
          ]);
        } else {
          const errorMessage = data.error || "Failed to generate image";
          console.log('Image generation failed:', errorMessage);
          setMessages(prev => [
            ...prev,
            { role: 'user', content: `Draw this for me: ${prompt}` },
            { role: 'assistant', content: "Oh dear, my artistic vision seems a bit clouded today. Could you try asking again? Sometimes my paintbrush needs a little rest!" }
          ]);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        console.log('Error in image generation:', errorMessage);
        setMessages(prev => [
          ...prev,
          { role: 'user', content: `Draw this for me: ${prompt}` },
          { role: 'assistant', content: "Ah, my artistic spirit is feeling a bit under the weather. Let's try again in a moment, dear!" }
        ]);
      } finally {
        setLoading(false);
      }
    };

    // Add timer submit handler
    const handleTimerSubmit = (seconds: number) => {
      // Add a system message to trigger the timer
      const timerMessage = `TIMER_REQUEST_${seconds}`;
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: timerMessage }
      ]);
    };

    // Add new handler for voice recording submit
    const handleVoiceSubmit = (text: string) => {
      sendMessage(text);
    };

    return (
      <div className="flex flex-col h-screen w-full bg-gradient-to-b from-amber-50/30 to-transparent">
        <div
          ref={messagesContainerRef}
          className={`flex-grow overflow-y-auto ml-4 transition-all duration-300 ${sidebarMarginClass} ${isImageUploadOpen ? 'pointer-events-none opacity-50' : ''}`}
        >
          <div className="p-6">
            <div className="flex justify-center mb-6">
              <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32" />
            </div>

            <div className="text-center text-2xl font-semibold mb-4">
              Ask me anything, dear
            </div>

            <ChatMessages
              messages={messages}
              loading={loading}
              setLoading={setLoading}
              onSuggestionClick={onSuggestionClick}
              onAssistantResponse={onAssistantResponse}
              isGeneratingMealPlan={isGeneratingMealPlan}
              mealPlanProgress={mealPlanProgress}
            />

            {/* Chat input area for mobile */}
            {windowWidth !== null && windowWidth < 768 && (
              <div
                className={`w-full max-w-2xl mx-auto mt-4 ${isImageUploadOpen ? 'pointer-events-none opacity-50' : ''}`}
              >
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    handleInputFocus();
                    if (windowWidth !== null && windowWidth < 768) {
                      requestAnimationFrame(() => {
                        scrollToBottom();
                      });
                    }
                  }}
                  onBlur={handleInputBlur}
                  placeholder="Chat with Baba Selo"
                  className="w-full p-3 mt-1 rounded-t-3xl focus:outline-none resize-none text-black bg-white placeholder-amber-900/50 border-2 border-amber-200 focus:border-amber-400 custom-scrollbar"
                  style={{
                    minHeight: "3rem",
                    maxHeight: "8.75rem",
                    overflowY: message.split("\n").length > 5 ? "auto" : "hidden",
                    paddingRight: "1rem",
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                />
                <div className="flex items-center justify-between bg-white p-2 rounded-b-3xl border-2 border-t-0 border-amber-200">
                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                      style={{ background: "transparent" }}
                      onClick={() => setIsImageUploadOpen(true)}
                    >
                      <FontAwesomeIcon icon={faCamera} className="text-amber-900" />
                    </button>
                    <button
                      className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                      style={{ background: "transparent" }}
                      onClick={() => setIsDrawImageOpen(true)}
                    >
                      <FontAwesomeIcon icon={faMagicWandSparkles} className="text-amber-900" />
                    </button>
                    <button
                      className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                      style={{ background: "transparent" }}
                      onClick={() => setIsTimerOpen(true)}
                    >
                      <FontAwesomeIcon icon={faClock} className="text-amber-900" />
                    </button>
                    <button
                      className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                      style={{ background: "transparent" }}
                      onClick={() => setIsVoiceRecordOpen(true)}
                    >
                      <FontAwesomeIcon icon={faMicrophone} className="text-amber-900" />
                    </button>
                    <button
                      className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                      style={{ background: "transparent" }}
                      onClick={() => setIsHelpOpen(true)}
                      title="What can Baba do?"
                      aria-label="Help"
                    >
                      <FontAwesomeIcon icon={faCircleQuestion} className="text-amber-900" />
                    </button>
                  </div>
                  <button
                    onClick={() => sendMessage(message)}
                    disabled={message.trim() === "" || loading}
                    className={`rounded-full w-10 h-10 flex items-center justify-center
                      ${message.trim() === "" || loading
                        ? "bg-amber-200 text-amber-700/60 cursor-not-allowed"
                        : "bg-amber-600 text-white hover:bg-amber-700"
                      }`}
                    title={message.trim() === "" ? "Message is empty" : ""}
                  >
                    {loading ? (
                      <SendButtonSpinner />
                    ) : (
                      <FontAwesomeIcon icon={faArrowUp} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center mt-2 mb-2">
                  Baba Selo is wise, but even I can mix things up. Double-check,
                  dear—better safe than sorry!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Scroll to bottom button - mobile only */}
        {windowWidth !== null && windowWidth < 768 && showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed left-1/2 -translate-x-1/2 bottom-8 bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg shadow-amber-900/20 z-50 hover:bg-amber-700"
          >
            <FontAwesomeIcon icon={faArrowDown} className="text-lg" />
          </button>
        )}

        {/* Chat input area for desktop */}
        {windowWidth !== null && windowWidth >= 768 && (
          <div
            className={`w-full max-w-2xl mx-auto px-4 md:px-0 ${isImageUploadOpen ? 'pointer-events-none opacity-50' : ''}`}
          >
            <textarea
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="Chat with Baba Selo"
              className="w-full p-3 mt-1 rounded-t-3xl focus:outline-none resize-none text-black bg-white placeholder-amber-900/40 border border-amber-100 custom-scrollbar"
              style={{
                minHeight: "3rem",
                maxHeight: "8.75rem",
                overflowY: message.split("\n").length > 5 ? "auto" : "hidden",
                paddingRight: "1rem",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}
            />
            <div className="flex items-center justify-between bg-white p-2 rounded-b-3xl border border-t-0 border-amber-100">
              <div className="flex items-center gap-2">
                <button
                  className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                  style={{ background: "transparent" }}
                  onClick={() => setIsImageUploadOpen(true)}
                >
                  <FontAwesomeIcon icon={faPaperclip} className="text-amber-900" />
                </button>
                <button
                  className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                  style={{ background: "transparent" }}
                  onClick={() => setIsDrawImageOpen(true)}
                >
                  <FontAwesomeIcon icon={faMagicWandSparkles} className="text-amber-900" />
                </button>
                <button
                  className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                  style={{ background: "transparent" }}
                  onClick={() => setIsTimerOpen(true)}
                >
                  <FontAwesomeIcon icon={faClock} className="text-amber-900" />
                </button>
                <button
                  className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                  style={{ background: "transparent" }}
                  onClick={() => setIsVoiceRecordOpen(true)}
                >
                  <FontAwesomeIcon icon={faMicrophone} className="text-amber-900" />
                </button>
                <button
                  className="p-2 rounded-md hover:bg-amber-100 flex items-center justify-center"
                  style={{ background: "transparent" }}
                  onClick={() => setIsHelpOpen(true)}
                  title="What can Baba do?"
                  aria-label="Help"
                >
                  <FontAwesomeIcon icon={faCircleQuestion} className="text-amber-900" />
                </button>
              </div>
              <button
                onClick={() => sendMessage(message)}
                disabled={message.trim() === "" || loading}
                  className={`rounded-full w-10 h-10 flex items-center justify-center
                  ${message.trim() === "" || loading
                    ? "bg-amber-200 text-amber-700/60 cursor-not-allowed"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                  }`}
                title={message.trim() === "" ? "Message is empty" : ""}
              >
                {loading ? (
                  <SendButtonSpinner />
                ) : (
                  <FontAwesomeIcon icon={faArrowUp} />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2 mb-2">
              Baba Selo is wise, but even I can mix things up. Double-check,
              dear—better safe than sorry!
            </p>
          </div>
        )}

        {/* Image Upload Popup */}
        <ImageUploadPopup
          isOpen={isImageUploadOpen}
          onClose={() => setIsImageUploadOpen(false)}
          onSubmit={handleImageSubmit}
        />

        {/* Draw Image Popup */}
        <DrawImagePopup
          isOpen={isDrawImageOpen}
          onClose={() => setIsDrawImageOpen(false)}
          onSubmit={(prompt, userId, drawingId) => handleDrawImageSubmit(prompt, userId, drawingId)}
        />

        {/* Timer Popup */}
        <TimerPopup
          isOpen={isTimerOpen}
          onClose={() => setIsTimerOpen(false)}
          onSubmit={handleTimerSubmit}
        />

        {/* Voice Record Popup */}
        <VoiceRecordPopup
          isOpen={isVoiceRecordOpen}
          onClose={() => setIsVoiceRecordOpen(false)}
          onSubmit={handleVoiceSubmit}
        />

        {/* Help Popup - What Baba can do */}
        <BabaHelpPopup
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
      </div>
    );
  },
);

ChatWindow.displayName = "ChatWindow";