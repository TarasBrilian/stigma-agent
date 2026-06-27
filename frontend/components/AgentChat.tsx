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
    <div className="flex h-80 flex-col rounded-lg border border-foreground/10">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-foreground/40">Ask the agent about this portfolio…</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
              m.role === "user"
                ? "ml-auto bg-foreground text-background"
                : "bg-foreground/5"
            }`}
          >
            {m.content}
          </div>
        ))}
        {chat.isPending && <p className="text-xs text-foreground/40">Agent is thinking…</p>}
      </div>
      <div className="flex gap-2 border-t border-foreground/10 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. Why did you rebalance last week?"
          className="flex-1 rounded-md border border-foreground/15 bg-transparent px-3 py-1.5 text-sm outline-none"
        />
        <button
          onClick={send}
          disabled={chat.isPending}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
