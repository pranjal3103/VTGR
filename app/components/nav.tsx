"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/profile", label: "Profile" },
  { href: "/qa", label: "Ask a question" },
  { href: "/practice", label: "Practice interview", disabled: true },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav
      className="border-b px-6 py-3 flex items-center gap-6"
      style={{ borderColor: "#E8E3DC", backgroundColor: "#FAF7F2" }}
    >
      <span
        className="text-sm font-semibold tracking-tight mr-4"
        style={{ color: "#2A2A2A" }}
      >
        Visa Sensei
      </span>
      {LINKS.map(link =>
        link.disabled ? (
          <span
            key={link.href}
            className="text-sm"
            style={{ color: "#C0BAB4" }}
          >
            {link.label}
          </span>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm transition-colors"
            style={{
              color: pathname === link.href ? "#2A2A2A" : "#8B8580",
              fontWeight: pathname === link.href ? 500 : 400,
              borderBottom: pathname === link.href ? "1px solid #2A2A2A" : "none",
              paddingBottom: "2px",
            }}
          >
            {link.label}
          </Link>
        )
      )}
    </nav>
  )
}
