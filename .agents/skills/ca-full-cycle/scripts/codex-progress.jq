# Turns `codex exec --json` events (one per line, on stdin) into one short progress line per change:
# "<done>/<total> · <current todo> — <latest action>". Run as `jq -nR --unbuffered -r -f codex-progress.jq`.
# codex-worker.sh writes these lines to ~/.cache/zen-progress/<label>.txt for the mods-menu Zen band.
def cmd:
  (.command // "")
  | sub("^/bin/(?:ba|z)?sh -lc [\"'](?<c>.*)[\"']$"; "\(.c)")
  | sub("^/bin/(?:ba|z)?sh -lc "; "")
  | gsub("\\s+"; " ")
  | if length > 80 then .[0:79] + "…" else . end;

foreach (inputs | fromjson? | select(type == "object")) as $e (
  {todo: "", act: "", out: false};
  .out = false
  | if $e.item.type == "todo_list" then
      ($e.item.items // []) as $items
      | (first($items[] | select(.completed | not) | .text) // "") as $next
      | .todo = "\([$items[] | select(.completed)] | length)/\($items | length)"
          + (if $next == "" then "" else " · " + $next end)
      | .out = true
    elif $e.type == "item.started" and $e.item.type == "command_execution" then
      .act = "$ " + ($e.item | cmd) | .out = true
    elif $e.type == "item.completed" and $e.item.type == "file_change" then
      .act = "editou \(($e.item.changes // []) | length) arquivo(s)" | .out = true
    elif $e.type == "turn.completed" then
      .act = "concluído" | .out = true
    else . end;
  select(.out) | [.todo, .act] | map(select(. != "")) | join(" — ")
)
