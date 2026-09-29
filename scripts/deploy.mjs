// Builds the static site and publishes out/ to the gh-pages branch, which GitHub Pages serves.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (cmd, cwd) => execSync(cmd, { stdio: "inherit", cwd });
const read = (cmd) => execSync(cmd).toString().trim();

const remote = read("git remote get-url origin");
const name = read("git config user.name");
const email = read("git config user.email");
const commit = read("git rev-parse --short HEAD");

rmSync("out", { recursive: true, force: true });
run("npm run build");

run("git init -q -b gh-pages", "out");
run("git add -A", "out");
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy ${commit}"`, "out");
run(`git push -f -q ${remote} gh-pages`, "out");

console.log(`Deployed ${commit} to gh-pages.`);
