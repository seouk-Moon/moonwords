import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".sites-runtime",
  ".wrangler",
  "dist",
  "node_modules",
  "pages-dist",
]);
const conflictMarker = /^(?:<{7}|>{7})(?:\s|$)/m;
const conflicts = [];

async function inspectDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspectDirectory(entryPath);
      return;
    }
    if (!entry.isFile()) return;

    const buffer = await readFile(entryPath);
    if (buffer.includes(0)) return;

    const contents = buffer.toString("utf8");
    if (conflictMarker.test(contents)) {
      conflicts.push(path.relative(root, entryPath));
    }
  }));
}

await inspectDirectory(root);

if (conflicts.length > 0) {
  console.error("\nGit 병합 충돌 표시가 남아 있어 빌드를 중단합니다:");
  for (const file of conflicts.sort()) console.error(`- ${file}`);
  console.error("\n<<<<<<< 및 >>>>>>> 구간을 올바르게 정리한 뒤 다시 빌드해 주세요.\n");
  process.exitCode = 1;
} else {
  console.log("병합 충돌 표시 검사 완료");
}
