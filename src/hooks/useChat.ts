import { useState } from "react";
import { sendChatMessage } from "../services/chat";
import type { ChatMessage } from "../services/chat";
import { personalityCacheKey, useMapStore } from "../store/mapStore";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useChat(placeId?: string, roastMode = false) {
  const threadKey = placeId ? personalityCacheKey(placeId, roastMode) : undefined;
  const messages = useMapStore((state) => (threadKey ? state.chatThreads[threadKey] ?? EMPTY_MESSAGES : EMPTY_MESSAGES));
  const addChatMessage = useMapStore((state) => state.addChatMessage);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!placeId || !trimmed || isSending) return;

    if (!threadKey) return;

    addChatMessage(threadKey, { role: "user", content: trimmed });
    setIsSending(true);
    setError(null);

    try {
      const reply = await sendChatMessage(placeId, trimmed, { roast: roastMode });
      addChatMessage(threadKey, { role: "character", content: reply });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setIsSending(false);
    }
  }

  return { messages, send, isSending, error };
}
