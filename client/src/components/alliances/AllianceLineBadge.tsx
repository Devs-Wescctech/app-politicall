import { CircleHelp, Flag, Handshake, Landmark, Megaphone, Scale, Users, type LucideIcon } from "lucide-react";
import type { AllianceLine } from "@shared/schema";
import { allianceLineTextColor } from "@shared/alliance-lines";

export type AllianceLineBadgeLine = Pick<AllianceLine, "name" | "color" | "icon">;

const allianceLineIcons: Record<string, LucideIcon> = {
  Flag,
  Landmark,
  Handshake,
  Users,
  Megaphone,
  Scale,
};

export function AllianceLineBadge({ line, className = "" }: { line: AllianceLineBadgeLine; className?: string }) {
  const Icon = allianceLineIcons[line.icon] ?? CircleHelp;
  const isKnownIcon = line.icon in allianceLineIcons;

  return (
    <span
      aria-label={`Linha politica: ${line.name}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-medium ${className}`}
      data-testid="alliance-line-badge"
      style={{ backgroundColor: line.color, borderColor: line.color, color: allianceLineTextColor(line.color) }}
    >
      <Icon
        aria-hidden={isKnownIcon}
        aria-label={isKnownIcon ? undefined : "Icone indisponivel"}
        className="h-4 w-4 shrink-0"
        data-testid={isKnownIcon ? `alliance-line-icon-${line.icon}` : undefined}
        role={isKnownIcon ? undefined : "img"}
      />
      <span>{line.name}</span>
    </span>
  );
}
