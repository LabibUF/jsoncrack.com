// Path through nested data structure (string keys or array indices)
export type Path = (string | number)[];

/**
 * Immutably updates a value at a specific path in nested data structure
 * Creates a shallow clone at each level to maintain immutability
 */
export function updateValueAtPath<T>(root: T, path: Path, next: unknown): T {
  // Return early if path is invalid
  if (!Array.isArray(path) || path.length === 0) return next as T;

  // Clone the root object or array
  const clone: any = Array.isArray(root) ? [...(root as any[])] : { ...(root as any) };
  let cur: any = clone; // Current position in clone
  let src: any = root; // Current position in source

  // Navigate and clone nested structures along the path
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    const childSrc = src?.[k];
    // Clone child if it's an array or object, otherwise create empty object
    const child =
      Array.isArray(childSrc) ? [...childSrc] :
      (childSrc && typeof childSrc === "object") ? { ...childSrc } : {};
    cur[k] = child;
    cur = child;
    src = childSrc;
  }

  // Set the new value at the final path segment
  cur[path[path.length - 1]] = next;
  return clone as T;
}