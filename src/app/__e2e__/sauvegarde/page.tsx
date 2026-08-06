import { notFound } from "next/navigation";

import { SaveHarness } from "./save-harness";

export const dynamic = "force-dynamic";

type HarnessScenario = "success" | "failure" | "conflict";

export default async function SaveHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.ENABLE_E2E_HARNESS !== "1") notFound();

  const requested = (await searchParams).scenario;
  const scenario: HarnessScenario = requested === "failure" || requested === "conflict" ? requested : "success";
  return <SaveHarness scenario={scenario} />;
}
