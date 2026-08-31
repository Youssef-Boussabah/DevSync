import type { RoomMember } from "@/types/realtime";

const MAX_VISIBLE = 3;

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RoomMembers({ members }: { members: RoomMember[] }) {
  if (members.length === 0) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - visible.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {visible.map((member) => (
          <span
            key={member.id}
            title={member.name}
            aria-label={member.name}
            className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-medium ring-2 ring-background"
          >
            {initialsFor(member.name)}
          </span>
        ))}
        {overflow > 0 && (
          <span
            title={`${overflow} more`}
            className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground ring-2 ring-background"
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
        {members.length} connected
      </span>
    </div>
  );
}
