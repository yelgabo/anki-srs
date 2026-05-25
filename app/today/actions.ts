"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SKIP_COOKIE } from "@/lib/skip-cookie";

export async function startSessionAction() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const jar = await cookies();
  jar.delete(SKIP_COOKIE);

  redirect("/review");
}
