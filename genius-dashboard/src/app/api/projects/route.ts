import { NextResponse } from "next/server";
import { loadProjects } from "@/lib/projects";

// O painel lê o GENIUS.md em runtime — nunca em build.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = loadProjects();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
