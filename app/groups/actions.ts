"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { GroupError } from "@/lib/group-actions";
import * as actions from "@/lib/group-actions";
import { duplicateGroup } from "@/lib/group-duplicate";

const MIN = 60 * 1000;

// Input caps. Mirror the zod-at-the-boundary pattern in review/signin/signup/
// timezone actions: the DB columns are unbounded (@db.Text / String / String[]),
// so cap length HERE before anything touches Prisma. Reject over-cap input.
const NAME_MAX = 200;
const DESC_MAX = 2000;
const TEXT_MAX = 20_000; // prompt / approach (@db.Text)
const URL_MAX = 2048;
const TAG_MAX = 50;
const TAGS_MAX = 50;
const ID_MAX = 64;

const idSchema = z.string().min(1).max(ID_MAX);

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESC_MAX).optional(),
});

const RenameGroupSchema = z.object({
  groupId: idSchema,
  name: z.string().max(NAME_MAX).optional(),
  description: z.string().max(DESC_MAX).optional(),
});

const ProblemInputSchema = z.object({
  title: z.string().min(1).max(NAME_MAX),
  prompt: z.string().max(TEXT_MAX),
  approach: z.string().max(TEXT_MAX),
  tags: z.array(z.string().min(1).max(TAG_MAX)).max(TAGS_MAX),
  url: z.string().max(URL_MAX).optional(),
});

/** Split the comma-separated tags field into a normalized array. */
function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function invalid(): never {
  redirect("/groups?error=invalid_input");
}

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
  const parsed = CreateGroupSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: formData.get("description") ? String(formData.get("description")) : undefined,
  });
  if (!parsed.success) invalid();
  let group;
  try {
    group = await actions.createGroup(userId, parsed.data.name, parsed.data.description);
  } catch (e) {
    fail(e);
  }
  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}

export async function renameGroupAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "rename", 60);
  const parsed = RenameGroupSchema.safeParse({
    groupId: String(formData.get("groupId")),
    name: formData.get("name") ? String(formData.get("name")) : undefined,
    description: formData.get("description") !== null ? String(formData.get("description")) : undefined,
  });
  if (!parsed.success) invalid();
  const { groupId, name, description } = parsed.data;
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
  limit(userId, "delete", 30);
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
  limit(userId, "deactivate", 60);
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
  limit(userId, "membership", 120);
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
  limit(userId, "membership", 120);
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
  const parsed = ProblemInputSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    approach: String(formData.get("approach") ?? ""),
    tags: parseTags(String(formData.get("tags") ?? "")),
    url: formData.get("url") ? String(formData.get("url")) : undefined,
  });
  if (!parsed.success) invalid();
  try {
    await actions.createProblemInGroup(userId, groupId, parsed.data);
  } catch (e) {
    fail(e);
  }
  revalidateAll();
  redirect(`/groups/${groupId}`);
}

export async function editProblemAction(formData: FormData) {
  const userId = await requireUser();
  limit(userId, "edit", 60);
  const groupId = String(formData.get("groupId"));
  const problemId = String(formData.get("problemId"));
  const parsed = ProblemInputSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
    approach: String(formData.get("approach") ?? ""),
    tags: parseTags(String(formData.get("tags") ?? "")),
    url: formData.get("url") ? String(formData.get("url")) : undefined,
  });
  if (!parsed.success) invalid();
  try {
    await actions.editProblem(userId, problemId, parsed.data);
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
