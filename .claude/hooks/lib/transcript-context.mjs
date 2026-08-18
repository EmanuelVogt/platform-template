// Single source of "how much context this session is carrying", used by the
// checkpoint hook and by the status line. The size of the transcript file is a
// poor proxy (it keeps turns already discarded); the exact number is in the
// usage of the model's last response. Harness tooling — not app code.
import { closeSync, openSync, readSync, statSync } from "node:fs";

export const readContextTokens = (transcriptPath, tailBytes = 512 * 1024) => {
  const size = statSync(transcriptPath).size;
  const length = Math.min(size, tailBytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(transcriptPath, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }

  const lines = buffer.toString("utf8").split("\n");
  if (size > length) lines.shift(); // the first line of the tail comes truncated

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i]) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    const usage = entry.message?.usage;
    if (!usage) continue;
    const total =
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.input_tokens ?? 0);
    if (total > 0) return total;
  }
  return 0;
};
