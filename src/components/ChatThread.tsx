import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import type { ChatMessage } from "../services/chat";

type Props = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isSending: boolean;
  error: string | null;
  disabled?: boolean;
};

export function ChatThread({ messages, onSend, isSending, error, disabled }: Props) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    onSend(message);
    setDraft("");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-slate-200 pt-4">
      <div className="mb-3 flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            Ask one thing before the character gets back to work.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto bg-teal-700 text-white"
                  : "mr-auto bg-slate-100 text-slate-800"
              }`}
            >
              {message.content}
            </div>
          ))
        )}
        {isSending ? <div className="mr-auto rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">Typing...</div> : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled || isSending}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-700/20 transition focus:border-teal-700 focus:ring-4 disabled:bg-slate-100"
          placeholder="Ask the place..."
        />
        <button
          type="submit"
          disabled={disabled || isSending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coral-600 text-white transition hover:bg-coral-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          style={{ backgroundColor: disabled || isSending || !draft.trim() ? undefined : "#df4f3f" }}
          aria-label="Send chat message"
          title="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
