"use client";

import { useState } from "react";
import { useChat } from "@/hooks/use-portfolios";
import type { ChatMessage } from "@/lib/types";

/** Natural-language Q&A about a portfolio (display-only answers from the agent). */
export function AgentChat({ vaultHash }: { vaultHash: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chat = useChat(vaultHash);

  const send = () => {
    const text = input.trim();
    if (!text || chat.isPending) return;
    setMessages((m) => [
      ...m,
      { id: `local-${m.length}`, role: "user", content: text, createdAt: new Date().toISOString() },
    ]);
    setInput("");
    chat.mutate(text, {
      onSuccess: (reply) => setMessages((m) => [...m, reply]),
    });
  };

  return (
    <div className="relief-panel flex h-80 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-ink-faint">Ask the agent about this portfolio…</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
              m.role === "user"
                ? "ml-auto bg-gold text-[#3a2f14]"
                : "relief-inset text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}
        {chat.isPending && <p className="text-xs text-ink-faint">Agent is thinking…</p>}
      </div>
      <div className="flex gap-2 border-t border-line/70 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. Why did you rebalance last week?"
          className="field flex-1 px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={chat.isPending} className="btn-gold px-4 py-2 text-sm">
          Send
        </button>
      </div>
    </div>
  );
}
