# Claude Code on your machine

Two scopes make a Claude Code session feel the same in every repo built from this template:

- **Repo scope** travels with `copier update` and is versioned here: `.claude/settings.json`
  (hook registration), `.claude/hooks/`, `.claude/agents/`, the skills under `.agents/skills/`
  (linked into `.claude/skills/` by `pnpm skills:sync`) and the `AGENTS.md` router.
- **Machine scope** is set up once per machine and never rendered by the template:
  `~/.claude/settings.json` (plugins, marketplaces, model, user hooks), the launchers on
  `PATH` and the editor config in `~/.config/nvim`. This page is its recipe.

The repo's `.claude/settings.json` declares no `enabledPlugins` and no `extraKnownMarketplaces`
on purpose: declared there, a plugin is installed into every clone of that one repo instead of
following the developer across repos.

## 1. UI mods (plugins)

Both UI mods ship from the Claude Code plugin marketplace `rituaali-mods`, whose manifest lives
in the GitHub repo `Rituaali-Health/RituaaliOS` (`<repo>/.claude-plugin/marketplace.json`):

- `mods-menu` — bottom-corner menu: Zen mode with a progress band, model / effort / permission
  controls, status line, the chat's worktree, agents panel, Filetree and Neovim buttons.
- `filetree` — IDE-style file tree with a Git tab; a click sends the file to Neovim.

Enable them once at user scope (the default of both commands), then restart the session. The
commands write `enabledPlugins` and `extraKnownMarketplaces` into `~/.claude/settings.json`:

```sh
claude plugin marketplace add Rituaali-Health/RituaaliOS   # registers "rituaali-mods"
claude plugin install mods-menu@rituaali-mods
claude plugin install filetree@rituaali-mods
```

**Loading.** From `~/.claude/plugins/cache/rituaali-mods/<mod>/<version>/`, never a checkout
of the marketplace repo. The first new session after an install may log `plugin-cache-miss`
and come up without the mods; the next one loads them. Keeping them current (restart after):

```sh
claude plugin marketplace update rituaali-mods
claude plugin update mods-menu@rituaali-mods && claude plugin update filetree@rituaali-mods
```

**Changing a mod.** A commit in the marketplace repo reaches no session until the mod's
`version` in its `plugin.json` is bumped, pushed, and the update above is run. To try an
unpushed mod first, start a new session with `claude --plugin-dir <checkout>/.claude/mods/<mod>`.

## 2. Neovim button

`Neovim` in the menu (also `/nvim [file]`) opens Neovim in a zellij pane beside the session and
sends the file clicked in the file tree to it. It needs, on the machine:

- **zellij** ≥ 0.45 on `PATH` (a static release binary works), with the Claude session
  running inside a zellij tab.
- **Neovim** ≥ 0.12 with the shared config:
  `git clone git@github.com:EmanuelVogt/nvim-config.git ~/.config/nvim`, then
  `nvim --headless "+Lazy! install" +qa`; mason installs the language servers on first start.
- The launchers the mod calls, `nvim-claude` (Neovim listening on one socket per git
  toplevel) and `nvim-claude-ctl` (`open | close | toggle | edit <file> [line]`), both on
  `PATH`. Not versioned anywhere yet — copy them from a machine where the button works.

After `open`, the mod waits for Neovim's IDE lock (`~/.claude/ide/<port>.lock`) and runs
`/ide`; confirm with ↑ then Enter. `/ide` only lists an editor that is already open.

Optional, same status as the launchers: the zellij tab shows the conversation title and state
through user-scope hooks in `~/.claude/settings.json` (`zj-tabtitle`, `zj-claude-estado`,
`retomar-conversas`, all on `PATH`) and a `claude()` wrapper at the end of `~/.zshrc`.

## 3. Checking a machine without opening a session

```sh
env -u ZELLIJ -u ZELLIJ_SESSION_NAME -u ZELLIJ_PANE_ID -u CLAUDECODE TERM=xterm-256color \
  timeout 45 script -qec "claude --debug-file /tmp/claude-boot.log" /dev/null
grep -E "plugin-cache-miss|SyntaxError|hook.*(error|failed)|rituaali-mods" /tmp/claude-boot.log
```

Run it from the repo root. Healthy: both mods listed, no `plugin-cache-miss`, SessionStart
hooks at status 0. `-u CLAUDECODE` matters when run from inside another Claude session.
