const DEFAULT_ANSWERS = {
  project_name: "Demo",
  github_org: "acme",
  root_domain: "demo.test",
};

export function renderChild({ repoRoot, targetDir, answers = DEFAULT_ANSWERS, run }) {
  const dataArgs = Object.entries(answers).flatMap(([key, value]) => ["--data", `${key}=${value}`]);
  return run("copier", ["copy", "--trust", "--defaults", "--vcs-ref", "HEAD", ...dataArgs, repoRoot, targetDir]);
}

export function installChild({ cwd, run }) {
  return run("pnpm", ["install"], { cwd });
}
