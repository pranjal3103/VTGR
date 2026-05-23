import fs from "fs"
import path from "path"
import yaml from "js-yaml"
import type { Profile } from "@/types/profile"

export type TestProfile = {
  number: number
  description: string
  profile: Profile
}

let _cache: TestProfile[] | null = null

export function loadTestProfiles(): TestProfile[] {
  if (_cache) return _cache
  const file = path.join(process.cwd(), "test-profiles.yaml")
  const raw = fs.readFileSync(file, "utf-8")
  _cache = (yaml.load(raw) as TestProfile[]) ?? []
  return _cache
}

export function getTestProfile(n: number): TestProfile | null {
  return loadTestProfiles().find(p => p.number === n) ?? null
}
