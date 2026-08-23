import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

// Para em módulos com variant: catalog/<name>/<variant>/module.json não descende além do module.json encontrado.
export function discoverEntries(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (existsSync(path.join(dir, "module.json"))) {
      entries.push(dir);
      continue;
    }
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (child.isDirectory()) stack.push(path.join(dir, child.name));
    }
  }
  return entries;
}
