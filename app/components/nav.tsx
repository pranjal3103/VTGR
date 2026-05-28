"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/profile", label: "Profile", short: "Profile" },
  { href: "/qa", label: "Ask a question", short: "Ask" },
  { href: "/practice", label: "Practice interview", short: "Practice" },
  { href: "/day-before", label: "Day before", short: "Day before" },
]

export function Nav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || (href === "/qa" && pathname.startsWith("/test"))

  return (
    <nav
      className="border-b px-4 sm:px-6 py-3 flex items-center gap-4 sm:gap-6"
      style={{ borderColor: "#E8E3DC", backgroundColor: "#FAF7F2" }}
    >
      <span
        className="hidden sm:inline text-sm font-semibold tracking-tight mr-2"
        style={{ color: "#2A2A2A" }}
      >
        Visa Sensei
      </span>
      {LINKS.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm transition-colors whitespace-nowrap"
          style={{
            color: isActive(link.href) ? "#2A2A2A" : "#8B8580",
            fontWeight: isActive(link.href) ? 500 : 400,
            borderBottom: isActive(link.href) ? "1px solid #2A2A2A" : "none",
            paddingBottom: "2px",
          }}
        >
          <span className="sm:hidden">{link.short}</span>
          <span className="hidden sm:inline">{link.label}</span>
        </Link>
      ))}
    </nav>
  )
}
