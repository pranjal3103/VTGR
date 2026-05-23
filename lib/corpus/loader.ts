import fs from "fs"
import path from "path"
import yaml from "js-yaml"
import type { OfficialEntry, PractitionerEntry, RedditEntry, Principle } from "@/types/corpus"

const CORPUS_DIR = path.join(process.cwd(), "corpus")

function load<T>(filename: string): T[] {
  const file = path.join(CORPUS_DIR, filename)
  if (!fs.existsSync(file)) return []
  const raw = fs.readFileSync(file, "utf-8")
  return (yaml.load(raw) as T[]) ?? []
}

// Loaded once at module evaluation — cached for the lifetime of the process.
export const official: OfficialEntry[] = load<OfficialEntry>("official.yaml")
export const practitioner: PractitionerEntry[] = load<PractitionerEntry>("practitioner.yaml").filter(
  (e) => e.validation_status === "passed"
)
export const reddit: RedditEntry[] = load<RedditEntry>("reddit.yaml")
export const principles: Principle[] = load<Principle>("principles.yaml").filter(
  (p) => p.validation_status === "passed"
)
