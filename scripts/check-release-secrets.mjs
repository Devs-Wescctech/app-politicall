import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { extname } from "node:path";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const BINARY_PREFIX_BYTES = 8 * 1024;
const KNOWN_BINARY_EXTENSIONS = new Set([
  ".7z", ".avi", ".bmp", ".class", ".dll", ".doc", ".docx", ".exe", ".gif",
  ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mp3", ".mp4", ".pdf", ".png",
  ".sqlite", ".tar", ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".zip",
]);
const DATABASE_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/([^\s/:@]+):([^\s/@]+)@/i;
const PRIVATE_KEY_MARKER = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
const SECRET_ASSIGNMENT = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PRIVATE_KEY|PASSWORD|PASSWD)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/;
const KNOWN_SECRET_PREFIX = /^(?:sk_(?:live|test)_[A-Za-z0-9]+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+)$/;

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^(?:["'])|(?:["'])$/g, "");

  return normalized === ""
    || /^\$\{[A-Z0-9_]+(?:[:?][-A-Za-z0-9_]+)?\}$/i.test(normalized)
    || /^<[^>]+>$/.test(normalized)
    || /^(?:your|replace|change|example|placeholder)[-_a-z0-9 ]*$/i.test(normalized)
    || /^(?:username|password|database_name)$/i.test(normalized);
}

function isHighConfidenceSecret(value) {
  const normalized = value.trim().replace(/^(?:["'])|(?:["'])$/g, "");

  if (isPlaceholder(normalized)) return false;
  if (KNOWN_SECRET_PREFIX.test(normalized)) return true;

  return normalized.length >= 32
    && /[A-Z]/.test(normalized)
    && /[a-z]/.test(normalized)
    && /\d/.test(normalized)
    && /^[A-Za-z0-9+/=_-]+$/.test(normalized);
}

function candidatePaths() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "buffer" },
  );
  const deleted = new Set(execFileSync(
    "git",
    ["ls-files", "--deleted", "-z"],
    { encoding: "buffer" },
  ).toString("utf8").split("\0").filter(Boolean));

  return output.toString("utf8").split("\0").filter((path) => path && !deleted.has(path));
}

function report(path, rule, line) {
  process.stderr.write(`${path}:${rule}:${line}\n`);
}

function hasExcessiveControlBytes(prefix) {
  let controlBytes = 0;
  for (const byte of prefix) {
    if ((byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte === 0x7f) {
      controlBytes += 1;
    }
  }

  return controlBytes / prefix.length > 0.05;
}

function isBinaryFile(path, size) {
  if (KNOWN_BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return true;
  if (size === 0) return false;

  const descriptor = openSync(path, "r");
  try {
    const prefix = Buffer.alloc(Math.min(size, BINARY_PREFIX_BYTES));
    const bytesRead = readSync(descriptor, prefix, 0, prefix.length, 0);
    const bytes = prefix.subarray(0, bytesRead);
    if (bytes.includes(0) || hasExcessiveControlBytes(bytes)) return true;

    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return false;
    } catch {
      return true;
    }
  } finally {
    closeSync(descriptor);
  }
}

let foundIssues = false;

function reportIoFailure(path, rule) {
  report(path, rule, 0);
  foundIssues = true;
}

for (const path of candidatePaths()) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    reportIoFailure(path, "io-stat");
    continue;
  }

  if (size > MAX_FILE_SIZE_BYTES) continue;

  try {
    if (isBinaryFile(path, size)) continue;
  } catch {
    reportIoFailure(path, "io-prefix");
    continue;
  }

  let contents;
  try {
    contents = readFileSync(path);
  } catch {
    reportIoFailure(path, "io-read");
    continue;
  }

  const lines = contents.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (PRIVATE_KEY_MARKER.test(line)) {
      report(path, "private-key-marker", lineNumber);
      foundIssues = true;
      return;
    }

    const databaseMatch = line.match(DATABASE_URL);
    if (databaseMatch && !isPlaceholder(databaseMatch[1]) && !isPlaceholder(databaseMatch[2])) {
      report(path, "database-url-credentials", lineNumber);
      foundIssues = true;
      return;
    }

    const assignment = line.match(SECRET_ASSIGNMENT);
    if (assignment && isHighConfidenceSecret(assignment[2])) {
      report(path, "secret-assignment", lineNumber);
      foundIssues = true;
    }
  });
}

if (foundIssues) process.exitCode = 1;
