import { Swords } from "lucide-react";
import type { PersonalityDuel } from "../services/personality";
import type { Poi } from "../services/poi";

type Props = {
  active: boolean;
  selectedPois: Poi[];
  duel: PersonalityDuel | null;
  isLoading: boolean;
};

type Fighter = {
  name: string;
  subtitle: string;
  imageUrl?: string;
};

export function DuelArena({ active, selectedPois, duel, isLoading }: Props) {
  if (!active) return null;

  const left = duel
    ? {
        name: duel.places.a.place.name,
        subtitle: duel.places.a.personality.displayName,
        imageUrl: duel.places.a.personality.imageUrl,
      }
    : toPendingFighter(selectedPois[0], "Fighter A");
  const right = duel
    ? {
        name: duel.places.b.place.name,
        subtitle: duel.places.b.personality.displayName,
        imageUrl: duel.places.b.personality.imageUrl,
      }
    : toPendingFighter(selectedPois[1], "Fighter B");

  return (
    <div className="pointer-events-none absolute inset-x-8 top-24 z-20 flex items-center justify-center">
      <div className="duel-arena-shell">
        <FighterSlot fighter={left} side="left" />
        <div className="duel-vs-stack">
          <div className={`duel-vs-badge ${isLoading ? "is-loading" : ""}`}>
            <Swords className="h-5 w-5" />
            <span>VS</span>
          </div>
          <p className="duel-vs-caption">
            {duel ? "FIGHTING NOW" : selectedPois.length ? "WHO FIGHTS NEXT?" : "DUEL MODE"}
          </p>
        </div>
        <FighterSlot fighter={right} side="right" />
      </div>
    </div>
  );
}

function FighterSlot({ fighter, side }: { fighter: Fighter; side: "left" | "right" }) {
  return (
    <div className={`duel-fighter duel-fighter-${side}`}>
      <div className="duel-fighter-portrait">
        {fighter.imageUrl ? (
          <img src={fighter.imageUrl} alt={fighter.subtitle} />
        ) : (
          <div className="duel-fighter-placeholder">
            <Swords className="h-9 w-9" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-950">{fighter.name}</p>
        <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{fighter.subtitle}</p>
      </div>
    </div>
  );
}

function toPendingFighter(poi: Poi | undefined, fallback: string): Fighter {
  return {
    name: poi?.name ?? fallback,
    subtitle: poi?.category ?? "Awaiting challenger",
  };
}
