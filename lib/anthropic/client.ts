import Anthropic from "@anthropic-ai/sdk"

// Singleton — instantiated once at module load on the server.
// Never import this from client components.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const MODELS = {
  fast: "claude-haiku-4-5-20251001",  // simulator turns, low-latency
  careful: "claude-sonnet-4-6",       // critique, Q&A synthesis, principles
} as const
