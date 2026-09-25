import { readFileSync } from "node:fs"
const header = readFileSync(process.argv[2], "utf8").split("\n")[0]
if (
  !/^(feat|fix|docs|test|refactor|perf|build|chore|ci|revert)\((cli|signing|privacy|repo|release)\)!?: .+/.test(
    header,
  ) &&
  !/^(Merge |Revert |fixup! |squash! )/.test(header)
) {
  console.error("Use type(scope): description; scopes: cli, signing, privacy, repo, release.")
  process.exitCode = 1
}
