export function extractPath(obj: unknown, path: string): unknown[] {
  const tokens = path.replace(/\[(\d+|\*)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown[] = [obj];

  for (const token of tokens) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node == null) continue;
      if (token === "*") {
        if (Array.isArray(node)) next.push(...node);
      } else if (/^\d+$/.test(token)) {
        if (Array.isArray(node)) {
          const value = node[Number(token)];
          if (value !== undefined) next.push(value);
        }
      } else {
        const value = (node as Record<string, unknown>)[token];
        if (value !== undefined) next.push(value);
      }
    }
    current = next;
  }

  return current;
}
