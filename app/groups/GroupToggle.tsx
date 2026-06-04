import { activateGroupAction, deactivateGroupAction } from "./actions";

export default function GroupToggle({ groupId, isActive }: { groupId: string; isActive: boolean }) {
  return (
    <form action={isActive ? deactivateGroupAction : activateGroupAction}>
      <input type="hidden" name="groupId" value={groupId} />
      <button
        type="submit"
        className={
          "h-8 rounded-lg px-3 text-xs font-medium transition-colors " +
          (isActive
            ? "bg-accent text-accent-fg hover:bg-accent-hover"
            : "border border-border bg-surface text-fg-3 hover:border-border-hi hover:text-fg")
        }
      >
        {isActive ? "on ●" : "off ○"}
      </button>
    </form>
  );
}
