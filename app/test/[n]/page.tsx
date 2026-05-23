import { notFound } from "next/navigation"
import { getTestProfile } from "@/lib/test-profiles"
import { TestBadge } from "@/app/components/test-badge"
import { QAChat } from "@/app/qa/qa-chat"

export default async function TestProfilePage({
  params,
}: {
  params: Promise<{ n: string }>
}) {
  if (process.env.ENABLE_TEST_MODE !== "true") notFound()

  const { n } = await params
  const num = parseInt(n, 10)
  if (isNaN(num) || num < 1 || num > 5) notFound()

  const testProfile = getTestProfile(num)
  if (!testProfile) notFound()

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      <TestBadge number={testProfile.number} description={testProfile.description} />
      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full px-6 py-8 flex flex-col">
        <div className="mb-6 flex-shrink-0">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#2A2A2A" }}>
            Ask a question
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#8B8580" }}>
            Every answer is grounded in official sources, practitioner advice, and real interview reports.
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <QAChat profile={testProfile.profile} />
        </div>
      </div>
    </div>
  )
}
