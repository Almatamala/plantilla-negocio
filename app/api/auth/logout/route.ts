import { NextResponse } from "next/server";
import { withoutSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function POST() {
  return withoutSessionCookie(NextResponse.json({ ok: true }));
}