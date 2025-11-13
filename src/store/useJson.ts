import { create } from "zustand";
import useGraph from "../features/editor/views/GraphView/stores/useGraph";
import useFile from "./useFile";
import { updateValueAtPath, type Path } from "../utils/updateValueAtPath";

// Actions for managing JSON state
interface JsonActions {
  setJson: (json: string) => void; // Set JSON and sync with graph and file
  getJson: () => string; // Get current JSON
  clear: () => void; // Clear all JSON data
  updateAtPath: (path: Path, next: unknown) => void; // Update value at specific path
}

// Initial state for JSON store
const initialStates = {
  json: "{}", // Default empty JSON object
  loading: true, // Loading state flag
};

export type JsonStates = typeof initialStates;

const useJson = create<JsonStates & JsonActions>()((set, get) => ({
  ...initialStates,

  getJson: () => get().json, // Return current JSON

  setJson: (json: string) => {
    // Update state and sync with graph and file stores
    set({ json, loading: false });
    useGraph.getState().setGraph(json);
    useFile.getState().setContents({ contents: json, skipUpdate: true });
  },

  clear: () => {
    // Clear JSON and dependent stores
    set({ json: "", loading: false });
    useGraph.getState().clearGraph();
    useFile.getState().setContents({ contents: "", skipUpdate: true });
  },

  updateAtPath: (path: Path, next: unknown) => {
    // Parse current JSON, update value at path, and save
    const current = get().json || "{}";
    let obj: unknown;
    try {
      obj = JSON.parse(current);
    } catch {
      return; // Exit if JSON is invalid
    }

    const updated = updateValueAtPath(obj, path, next);
    get().setJson(JSON.stringify(updated, null, 2));
  },
}));

export default useJson;