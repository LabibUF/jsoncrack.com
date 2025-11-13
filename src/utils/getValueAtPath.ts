// Path through nested object/array structure
export type Path = (string | number)[];

// Get value from nested structure using path
export function getValueAtPath(root: unknown, path: Path): unknown {
  let cur: any = root;
  for (const seg of path) {
    // Return undefined if path is invalid
    if (cur == null) return undefined;
    cur = cur[seg as any];
  }
  return cur;
}
