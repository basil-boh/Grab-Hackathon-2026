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
  selectPoi: (poi: Poi) => void;
  setPersonality: (placeId: string, personality: Personality) => void;
  addChatMessage: (placeId: string, message: ChatMessage) => void;
  setRoute: (route: RouteData | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  selectedPoi: null,
  personalityCache: {},
  chatThreads: {},
  activeRoute: null,
  selectPoi: (poi) =>
    set({
      selectedPoi: poi,
      activeRoute: null,
    }),
  setPersonality: (placeId, personality) =>
    set((state) => ({
      personalityCache: {
        ...state.personalityCache,
        [placeId]: personality,
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
}));
