import path from "node:path";

export const LINTABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".vue",
]);

export function collectLintableChangedFiles(...outputs) {
  return collectChangedFiles(LINTABLE_EXTENSIONS, outputs);
}

export function collectPythonChangedFiles(...outputs) {
  return collectChangedFiles(new Set([".py", ".pyi"]), outputs);
}

function collectChangedFiles(extensions, outputs) {
  return Array.from(
    new Set(
      outputs
        // Git -z output separates names with NUL and keeps them exact. Newline output is trimmed.
        .flatMap((output) => output.includes("\0") ? output.split("\0") : output.split("\n").map((file) => file.trim()))
        .filter(Boolean)
        .filter((file) => extensions.has(path.extname(file))),
    ),
  ).sort();
}
