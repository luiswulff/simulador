import DashboardShell from "@/components/DashboardShell";
import { loadProjects } from "@/lib/projects";

// O GENIUS.md é lido a cada request — o painel nunca serve um snapshot de build.
export const dynamic = "force-dynamic";

export default function Page() {
  const payload = loadProjects();
  return <DashboardShell payload={payload} />;
}
