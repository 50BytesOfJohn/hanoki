import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ModelPickerPreferences {
  /** Rail section the picker reopens on; null until one is chosen. */
  pickerSectionId: string | null;
  /** Rail section the model library reopens on. */
  librarySectionId: string | null;
  setPickerSectionId: (sectionId: string) => void;
  setLibrarySectionId: (sectionId: string) => void;
}

/** App-wide, not per workspace: where you browse models is a personal habit. */
export const useModelPickerPreferences = create<ModelPickerPreferences>()(
  persist(
    (set) => ({
      pickerSectionId: null,
      librarySectionId: null,
      setPickerSectionId: (pickerSectionId) => set({ pickerSectionId }),
      setLibrarySectionId: (librarySectionId) => set({ librarySectionId }),
    }),
    {
      name: "model-picker-preferences",
      version: 1,
      partialize: ({ pickerSectionId, librarySectionId }) => ({
        pickerSectionId,
        librarySectionId,
      }),
    },
  ),
);
