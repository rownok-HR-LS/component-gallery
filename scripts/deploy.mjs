// Builds the static site and publishes it to the gh-pages branch, which GitHub Pages serves.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Its own build folder, so a deploy can run while `next dev` is using .next.
// With output: "export", Next writes the static site into this folder instead of out/.
const DIR = ".next-deploy";

const run = (cmd, cwd, env) => execSync(cmd, { stdio: "inherit", cwd, env: { ...process.env, ...env } });
const read = (cmd) => execSync(cmd).toString().trim();

const remote = read("git remote get-url origin");
const name = read("git config user.name");
const email = read("git config user.email");
const commit = read("git rev-parse --short HEAD");

rmSync(DIR, { recursive: true, force: true });
run("npm run build", undefined, { NEXT_DIST_DIR: DIR });

run("git init -q -b gh-pages", DIR);
// Windows limits paths to 260 characters unless git is told otherwise.
run("git config core.longpaths true", DIR);
run("git add -A", DIR);
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy ${commit}"`, DIR);
run(`git push -f -q ${remote} gh-pages`, DIR);

console.log(`Deployed ${commit} to gh-pages.`);
