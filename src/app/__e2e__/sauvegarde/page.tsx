import { notFound } from "next/navigation";

import { SaveHarness } from "./save-harness";
import BibliothequeE2EPage from "../bibliotheque/page";

export const dynamic = "force-dynamic";

type HarnessScenario = "success" | "failure" | "conflict" | "library";

export default async function SaveHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.ENABLE_E2E_HARNESS !== "1") notFound();

  const requested = (await searchParams).scenario;
  const scenario: HarnessScenario = requested === "failure" || requested === "conflict" || requested === "library" ? requested : "success";
  if (scenario === "library") return <BibliothequeE2EPage />;
  return <SaveHarness scenario={scenario} />;
}
