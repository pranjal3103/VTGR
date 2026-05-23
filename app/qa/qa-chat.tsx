"use client"

import { useState, useRef, useEffect } from "react"
import type { Profile } from "@/types/profile"
import type { Principle, OfficialEntry, PractitionerEntry, RedditEntry } from "@/types/corpus"

type Sources = {
  principles: Principle[]
  official: OfficialEntry[]
  practitioner: PractitionerEntry[]
  reddit: RedditEntry[]
}

type QAMessage = {
  question: string
  answer: string
  sources: Sources | null
  streaming: boolean
}

function CitationBadge({
  type,
  label,
  url,
}: {
  type: "official" | "practitioner" | "reddit"
  label: string
  url?: string
}) {
  const configs = {
    official: {
      icon: "⚖",
      style: {
        backgroundColor: "#F0EBE3",
        border: "1px solid #C8BFB4",
        color: "#2A2A2A",
        fontWeight: 600,
      },
    },
    practitioner: {
      icon: "📋",
      style: {
        backgroundColor: "#F5F3EF",
        border: "1px solid #D8D3CC",
        color: "#4A4A4A",
        fontWeight: 500,
      },
    },
    reddit: {
      icon: "💬",
      style: {
        backgroundColor: "#FAFAFA",
        border: "1px solid #E0DEDD",
        color: "#6B6B6B",
        fontWeight: 400,
      },
    },
  }

  const cfg = configs[type]
  const content = (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs tracking-wide font-sans"
      style={cfg.style}
    >
      <span>{cfg.icon}</span>
      <span style={{ fontVariant: "small-caps", letterSpacing: "0.04em" }}>{label}</span>
    </span>
  )

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
        {content}
      </a>
    )
  }
  return content
}

function SourcesPanel({ sources }: { sources: Sources }) {
  const hasSources =
    sources.principles.length > 0 ||
    sources.official.length > 0 ||
    sources.practitioner.length > 0 ||
    sources.reddit.length > 0

  if (!hasSources) return null

  return (
    <div className="mt-4 pt-3 border-t flex flex-wrap gap-1.5" style={{ borderColor: "#E8E3DC" }}>
      {sources.principles.map(p => (
        <CitationBadge key={p.id} type="official" label={p.id} />
      ))}
      {sources.official.map(e => (
        <CitationBadge key={e.id} type="official" label={e.source?.replace(/_/g, " ") ?? e.id} url={e.source_url} />
      ))}
      {sources.practitioner.map(e => (
        <CitationBadge key={e.id} type="practitioner" label={e.source_site ?? e.id} url={e.source_url} />
      ))}
      {sources.reddit.map(r => (
        <CitationBadge
          key={r.id}
          type="reddit"
          label={`Reddit · ${r.consulate !== "unknown" ? r.consulate : "India"} · ${r.date_posted?.slice(0, 7) ?? ""}`}
          url={r.source_url}
        />
      ))}
    </div>
  )
}

export function QAChat({ profile }: { profile: Profile }) {
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput("")
    setLoading(true)

    const msgIndex = messages.length
    setMessages(prev => [
      ...prev,
      { question, answer: "", sources: null, streaming: true },
    ])

    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, profile }),
      })

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "sources") {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === msgIndex
                    ? { ...m, sources: { principles: event.principles, official: event.official, practitioner: event.practitioner, reddit: event.reddit } }
                    : m
                )
              )
            } else if (event.type === "delta") {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === msgIndex ? { ...m, answer: m.answer + event.text } : m
                )
              )
            } else if (event.type === "done") {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === msgIndex ? { ...m, streaming: false } : m
                )
              )
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map((m, i) =>
          i === msgIndex
            ? { ...m, answer: "Something went wrong. Please try again.", streaming: false }
            : m
        )
      )
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-8">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "#8B8580" }}>
              Ask anything about the B1/B2 visa process, your interview, or what officers look for.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 max-w-md mx-auto">
              {[
                "What does 214(b) actually mean?",
                "What ties to India should I emphasise?",
                "How do I explain visiting my partner in the US?",
                "What happens if I was refused before?",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-left text-xs px-3 py-2 rounded border transition-colors hover:bg-stone-50"
                  style={{ borderColor: "#D9D4CC", color: "#6B6B6B" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {/* Question */}
            <div className="mb-3">
              <p className="text-sm font-medium" style={{ color: "#2A2A2A" }}>
                {msg.question}
              </p>
            </div>

            {/* Answer */}
            <div
              className="rounded-md p-4"
              style={{ backgroundColor: "#F5F2ED", border: "1px solid #E8E3DC" }}
            >
              <p
                className="text-sm leading-7 whitespace-pre-wrap"
                style={{ color: "#2A2A2A" }}
              >
                {msg.answer}
                {msg.streaming && (
                  <span
                    className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse"
                    style={{ backgroundColor: "#8B8580" }}
                  />
                )}
              </p>

              {msg.sources && !msg.streaming && (
                <SourcesPanel sources={msg.sources} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="border-t pt-4"
        style={{ borderColor: "#E8E3DC" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm border rounded-md outline-none transition-colors resize-none disabled:opacity-50"
            style={{
              borderColor: "#D9D4CC",
              backgroundColor: "white",
              color: "#2A2A2A",
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-40"
            style={{ backgroundColor: "#2A2A2A", color: "#FAF7F2" }}
          >
            {loading ? "…" : "Ask"}
          </button>
        </form>
        <p className="mt-2 text-xs" style={{ color: "#B0AAA4" }}>
          ⚖ Official sources &nbsp;·&nbsp; 📋 Practitioner advice &nbsp;·&nbsp; 💬 Reddit examples
        </p>
      </div>
    </div>
  )
}
