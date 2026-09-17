import { DatasetRegistry } from "./dataset-registry";
import { BUILT_IN_SOURCES } from "./sources";

/** One registry per browser session, seeded only with provenance-checked built-ins. */
let instance: DatasetRegistry | null = null;

export function signalRegistry(): DatasetRegistry {
  if (!instance) {
    instance = new DatasetRegistry();
    for (const dataset of BUILT_IN_SOURCES) {
      try {
        instance.register(dataset);
      } catch {
        // Already registered — never silently overwrite a definition.
      }
    }
  }
  return instance;
}
