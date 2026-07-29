import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
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

  return output.toString("utf8").split("\0").filter(Boolean);
}

function report(path, rule, line) {
  process.stderr.write(`${path}:${rule}:${line}\n`);
}

let foundSecrets = false;

for (const path of candidatePaths()) {
  let contents;
  try {
    contents = readFileSync(path);
  } catch {
    continue;
  }

  if (contents.length > MAX_FILE_SIZE_BYTES || contents.includes(0)) continue;

  const lines = contents.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (PRIVATE_KEY_MARKER.test(line)) {
      report(path, "private-key-marker", lineNumber);
      foundSecrets = true;
      return;
    }

    const databaseMatch = line.match(DATABASE_URL);
    if (databaseMatch && !isPlaceholder(databaseMatch[1]) && !isPlaceholder(databaseMatch[2])) {
      report(path, "database-url-credentials", lineNumber);
      foundSecrets = true;
      return;
    }

    const assignment = line.match(SECRET_ASSIGNMENT);
    if (assignment && isHighConfidenceSecret(assignment[2])) {
      report(path, "secret-assignment", lineNumber);
      foundSecrets = true;
    }
  });
}

if (foundSecrets) process.exitCode = 1;
