"use client"

export function TestBadge({ number, description }: { number: number; description: string }) {
  return (
    <div
      className="w-full px-6 py-2 text-center text-xs tracking-wider"
      style={{
        backgroundColor: "#7A1F1F",
        color: "#FAF7F2",
        fontVariant: "small-caps",
        letterSpacing: "0.08em",
      }}
    >
      TEST MODE: Profile #{number} — {description}
    </div>
  )
}
