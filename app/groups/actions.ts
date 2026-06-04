"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { GroupError } from "@/lib/group-actions";
import * as actions from "@/lib/group-actions";
import { duplicateGroup } from "@/lib/group-duplicate";

const MIN = 60 * 1000;

async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user.id;
}

function limit(userId: string, name: string, max: number) {
  const rl = rateLimit({ key: `groups:${name}:${userId}`, limit: max, windowMs: MIN });
  if (!rl.ok) redirect("/groups?error=rate_limited");
}

function fail(e: unknown): never {
  if (e instanceof GroupError) redirect(`/groups?error=${e.code}`);
  throw e;
}

function revalidateAll() {
  revalidatePath("/groups");
  revalidatePath("/today");
  revalidatePath("/review");
}

export async function createGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "create", 20);
  const name = String(formData.get("name") ?? "");
  const description = formData.get("description") ? String(formData.get("description")) : undefined;
  let group;
  try {
    group = await actions.createGroup(userId, name, description);
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}

export async function renameGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const name = formData.get("name") ? String(formData.get("name")) : undefined;
  const description = formData.get("description") !== null ? String(formData.get("description")) : undefined;
  try {
    await actions.renameGroup(userId, groupId, { name, description });
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  try {
    await actions.deleteGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  redirect("/groups");
}

export async function activateGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "activate", 60);
  const groupId = String(formData.get("groupId"));
  try {
    await actions.activateGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
}

export async function deactivateGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  try {
    await actions.deactivateGroup(userId, groupId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
}

export async function addProblemToGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.addProblemToGroup(userId, groupId, problemId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  revalidatePath(`/groups/${groupId}`);
}

export async function removeProblemFromGroupAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.removeProblemFromGroup(userId, groupId, problemId);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  revalidatePath(`/groups/${groupId}`);
}

export async function createProblemInGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "author", 60);
  const groupId = String(formData.get("groupId"));
  try {
    await actions.createProblemInGroup(userId, groupId, {
      title: String(formData.get("title") ?? ""),
      prompt: String(formData.get("prompt") ?? ""),
      approach: String(formData.get("approach") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      url: formData.get("url") ? String(formData.get("url")) : undefined,
    });
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  redirect(`/groups/${groupId}`);
}

export async function editProblemAction(formData: FormData) {
  const userId = await requireUser();
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  try {
    await actions.editProblem(userId, problemId, {
      title: String(formData.get("title") ?? ""),
      prompt: String(formData.get("prompt") ?? ""),
      approach: String(formData.get("approach") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      url: formData.get("url") ? String(formData.get("url")) : undefined,
    });
  } catch (e) {
    fail(e);
  }
  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

export async function duplicateGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "duplicate", 20);
  const sourceGroupId = String(formData.get("sourceGroupId"));
  let copy;
  try {
    copy = await duplicateGroup(userId, sourceGroupId);
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${copy.id}?copied=1`);
}
