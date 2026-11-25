import { CaseView } from "@/components/case/case-view";

// Case data lives in localStorage, so this route renders on request rather than at build.
export const instant = false;

export default function CasePage({ params }: PageProps<"/case/[id]">) {
  return <CaseView params={params} />;
}
