"use client";

interface ProblemFormProps {
  groupId: string;
  action: (fd: FormData) => void | Promise<void>;
  problem?: {
    id: string;
    title: string;
    prompt: string;
    approach: string;
    tags: string[];
    url: string | null;
  };
}

export default function ProblemForm({ groupId, action, problem }: ProblemFormProps) {
  const isEditing = problem !== undefined;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      {isEditing && <input type="hidden" name="problemId" value={problem.id} />}

      <label className="block space-y-1.5">
        <span className="label">Title</span>
        <input
          name="title"
          required
          defaultValue={problem?.title}
          className="block h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="label">Prompt</span>
        <textarea
          name="prompt"
          rows={3}
          defaultValue={problem?.prompt}
          className="block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors resize-y"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="label">Approach</span>
        <textarea
          name="approach"
          rows={3}
          defaultValue={problem?.approach}
          className="block w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors resize-y"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="label">Tags</span>
        <input
          name="tags"
          defaultValue={problem?.tags.join(", ")}
          placeholder="tags, comma separated"
          className="block h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="label">URL</span>
        <input
          name="url"
          type="url"
          defaultValue={problem?.url ?? ""}
          className="block h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
        />
      </label>

      <button
        type="submit"
        className="h-12 rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
      >
        Save card
      </button>
    </form>
  );
}
