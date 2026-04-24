export type ChatMessage = {
  role: "user" | "character";
  content: string;
};

type ErrorPayload = { error: string };

export async function sendChatMessage(placeId: string, message: string): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId, message }),
  });

  const payload = (await response.json()) as { reply: string } | ErrorPayload;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : response.statusText);
  }

  return payload.reply;
}
