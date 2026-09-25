"use client";

import { create } from "zustand";

export type StudioView =
  | "dashboard"
  | "dsh"
  | "productions"
  | "characters"
  | "story"
  | "comic"
  | "timeline"
  | "render"
  | "reviews"
  | "continuity"
  | "terminology"
  | "subtitles"
  | "history";

interface StudioState {
  view: StudioView;
  projectId: string | null;
  previewOpen: boolean;
  previewSceneId: string | null;
  previewShotNumber: number;
  setView: (v: StudioView) => void;
  setProject: (id: string | null) => void;
  openPreview: (sceneId: string, shotNumber?: number) => void;
  closePreview: () => void;
}

export const useStudio = create<StudioState>((set) => ({
  view: "dashboard",
  projectId: null,
  previewOpen: false,
  previewSceneId: null,
  previewShotNumber: 1,
  setView: (view) => set({ view }),
  setProject: (projectId) => set({ projectId }),
  openPreview: (sceneId, shotNumber = 1) => set({ previewOpen: true, previewSceneId: sceneId, previewShotNumber: shotNumber }),
  closePreview: () => set({ previewOpen: false }),
}));
