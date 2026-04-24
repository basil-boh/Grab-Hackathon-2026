import { create } from "zustand";
import type { ChatMessage } from "../services/chat";
import type { Personality } from "../services/personality";
import type { Poi } from "../services/poi";
import type { RouteData } from "../services/route";

type MapState = {
  selectedPoi: Poi | null;
  personalityCache: Record<string, Personality>;
  chatThreads: Record<string, ChatMessage[]>;
  activeRoute: RouteData | null;
  roastMode: boolean;
  selectPoi: (poi: Poi) => void;
  setPersonality: (placeId: string, personality: Personality, roastMode?: boolean) => void;
  addChatMessage: (placeId: string, message: ChatMessage) => void;
  setRoute: (route: RouteData | null) => void;
  setRoastMode: (value: boolean) => void;
};

export function personalityCacheKey(placeId: string, roastMode: boolean) {
  return `${placeId}:${roastMode ? "roast" : "normal"}`;
}

export const useMapStore = create<MapState>((set) => ({
  selectedPoi: null,
  personalityCache: {},
  chatThreads: {},
  activeRoute: null,
  roastMode: false,
  selectPoi: (poi) =>
    set({
      selectedPoi: poi,
      activeRoute: null,
    }),
  setPersonality: (placeId, personality, roastMode = false) =>
    set((state) => ({
      personalityCache: {
        ...state.personalityCache,
        [personalityCacheKey(placeId, roastMode)]: personality,
      },
    })),
  addChatMessage: (placeId, message) =>
    set((state) => ({
      chatThreads: {
        ...state.chatThreads,
        [placeId]: [...(state.chatThreads[placeId] ?? []), message],
      },
    })),
  setRoute: (route) => set({ activeRoute: route }),
  setRoastMode: (value) => set({ roastMode: value }),
}));
