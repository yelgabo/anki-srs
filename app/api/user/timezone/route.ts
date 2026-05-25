import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  timezone: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = rateLimit({ key: `tz:user:${userId}`, limit: 1, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Validate against runtime-supported IANA names.
  const supported = Intl.supportedValuesOf("timeZone");
  if (!supported.includes(parsed.data.timezone)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { timezone: parsed.data.timezone },
  });

  return NextResponse.json({ ok: true });
}
