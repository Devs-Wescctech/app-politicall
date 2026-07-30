import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(process.cwd(), "client/src");
const publicSessionPages = [
  "pages/petition-public.tsx",
  "pages/survey-landing.tsx",
  "pages/public-support.tsx",
  "pages/alliance-invite.tsx",
] as const;

async function sourceFiles(directory: string, relative = ""): Promise<Array<{ relative: string; source: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryRelative = path.join(relative, entry.name);
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath, entryRelative);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    return [{ relative: entryRelative.replaceAll("\\", "/"), source: await readFile(entryPath, "utf8") }];
  }));
  return nested.flat();
}

function isTaskSixAdminBoundary(relative: string): boolean {
  return relative === "pages/contracts.tsx"
    || relative === "pages/admin.tsx"
    || relative === "pages/admin-login.tsx"
    || relative === "pages/admin-sales.tsx"
    || relative === "components/admin-bottom-nav.tsx"
    || relative.startsWith("components/admin/");
}

type ConstInitializers = ReadonlyMap<string, ts.Expression | null>;

function collectConstInitializers(sourceFile: ts.SourceFile): ConstInitializers {
  const initializers = new Map<string, ts.Expression | null>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isVariableDeclarationList(node.parent)
      && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
      const name = node.name.text;
      initializers.set(name, initializers.has(name) ? null : node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializers;
}

function resolveConstExpression(
  expression: ts.Expression,
  initializers: ConstInitializers,
  seen = new Set<string>(),
): ts.Expression {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)) {
    return resolveConstExpression(expression.expression, initializers, seen);
  }
  if (!ts.isIdentifier(expression) || seen.has(expression.text)) return expression;
  const initializer = initializers.get(expression.text);
  if (!initializer) return expression;
  const nextSeen = new Set(seen);
  nextSeen.add(expression.text);
  return resolveConstExpression(initializer, initializers, nextSeen);
}

function staticString(expression: ts.Expression, initializers: ConstInitializers): string | undefined {
  const resolved = resolveConstExpression(expression, initializers);
  if (ts.isStringLiteralLike(resolved)) return resolved.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, initializers);
    const right = staticString(resolved.right, initializers);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function staticPrefix(expression: ts.Expression, initializers: ConstInitializers): string | undefined {
  const resolved = resolveConstExpression(expression, initializers);
  if (ts.isStringLiteralLike(resolved)) return resolved.text;
  if (ts.isTemplateExpression(resolved)) return resolved.head.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, initializers);
    if (left !== undefined) return left + (staticPrefix(resolved.right, initializers) ?? "");
    return staticPrefix(resolved.left, initializers);
  }
  return undefined;
}

function isForbiddenBearer(expression: ts.Expression, initializers: ConstInitializers): boolean {
  const resolved = resolveConstExpression(expression, initializers);
  if (ts.isConditionalExpression(resolved)) {
    return isForbiddenBearer(resolved.whenTrue, initializers)
      || isForbiddenBearer(resolved.whenFalse, initializers);
  }
  const prefix = staticPrefix(resolved, initializers);
  const match = prefix?.match(/^\s*Bearer\s+(\S*)/i);
  if (!match) return false;
  return match[1] !== "YOUR_API_KEY" && !match[1].startsWith("pk_");
}

function propertyName(
  name: ts.PropertyName,
  initializers: ConstInitializers,
): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return staticString(name.expression, initializers);
  return undefined;
}

function isBrowserStorage(
  expression: ts.Expression,
  initializers: ConstInitializers,
): boolean {
  const resolved = resolveConstExpression(expression, initializers);
  if (ts.isIdentifier(resolved)) {
    return resolved.text === "localStorage" || resolved.text === "sessionStorage";
  }
  if (ts.isPropertyAccessExpression(resolved)) {
    return ts.isIdentifier(resolved.expression)
      && resolved.expression.text === "window"
      && (resolved.name.text === "localStorage" || resolved.name.text === "sessionStorage");
  }
  if (ts.isElementAccessExpression(resolved) && ts.isIdentifier(resolved.expression) && resolved.expression.text === "window") {
    const storageName = resolved.argumentExpression && staticString(resolved.argumentExpression, initializers);
    return storageName === "localStorage" || storageName === "sessionStorage";
  }
  return false;
}

function assignedHeaderName(
  expression: ts.Expression,
  initializers: ConstInitializers,
): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
    return staticString(expression.argumentExpression, initializers);
  }
  return undefined;
}

function tenantCredentialViolations(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "tenant-source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const initializers = collectConstInitializers(sourceFile);
  const violations: string[] = [];
  const report = (node: ts.Node, kind: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${kind}:${line + 1}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && isBrowserStorage(node.expression.expression, initializers)
      && ["getItem", "setItem", "removeItem"].includes(node.expression.name.text)
      && node.arguments[0]
      && staticString(node.arguments[0], initializers) === "auth_token") {
      report(node, "browser auth_token storage");
    }

    if (ts.isElementAccessExpression(node)
      && isBrowserStorage(node.expression, initializers)
      && node.argumentExpression
      && staticString(node.argumentExpression, initializers) === "auth_token") {
      report(node, "browser auth_token property");
    }

    if (ts.isPropertyAccessExpression(node)
      && isBrowserStorage(node.expression, initializers)
      && node.name.text === "auth_token") {
      report(node, "browser auth_token property");
    }

    if (ts.isPropertyAssignment(node)
      && propertyName(node.name, initializers)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.initializer, initializers)) {
      report(node, "tenant bearer object");
    }

    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "set"
      && node.arguments[0]
      && node.arguments[1]
      && staticString(node.arguments[0], initializers)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.arguments[1], initializers)) {
      report(node, "tenant bearer Headers.set");
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && assignedHeaderName(node.left, initializers)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.right, initializers)) {
      report(node, "tenant bearer assignment");
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

describe("tenant browser auth source gate", () => {
  it("recognizes tenant storage and direct Bearer construction variants", () => {
    const prohibited = [
      'window.localStorage.getItem("auth_token")',
      'localStorage.setItem("auth_token", token)',
      'const TOKEN_KEY = "auth_token"; localStorage.setItem(TOKEN_KEY, token)',
      'const headers = { Authorization: `Bearer ${token}` }',
      'const headers = new Headers({ authorization: `Bearer ${token}` })',
      'headers.set("Authorization", `Bearer ${token}`)',
      'const AUTH_HEADER = "Authorization"; headers.set(AUTH_HEADER, `Bearer ${token}`)',
      'headers["Authorization"] = `Bearer ${token}`',
      'headers.authorization = `Bearer ${token}`',
    ];
    for (const fixture of prohibited) expect(tenantCredentialViolations(fixture), fixture).not.toEqual([]);
    expect(tenantCredentialViolations('const TOKEN_KEY = "theme"; localStorage.setItem(TOKEN_KEY, value)')).toEqual([]);
    expect(tenantCredentialViolations('const docs = "Bearer YOUR_API_KEY"')).toEqual([]);
    expect(tenantCredentialViolations('const docs = "Bearer pk_example"')).toEqual([]);
    expect(tenantCredentialViolations('const AUTH_HEADER = "Authorization"; headers.set(AUTH_HEADER, "Bearer pk_example")')).toEqual([]);
  });

  it("resolves credential aliases by lexical binding and detects Headers.append", () => {
    const prohibited = [
      `function storeAuth(token: string) {
        const TOKEN_KEY = "auth_token";
        localStorage.setItem(TOKEN_KEY, token);
      }
      function storeTheme(value: string) {
        const TOKEN_KEY = "theme";
        localStorage.setItem(TOKEN_KEY, value);
      }`,
      `{
        const TOKEN_KEY = "auth_token";
        window.localStorage.setItem(TOKEN_KEY, token);
      }
      {
        const TOKEN_KEY = "theme";
        window.localStorage.setItem(TOKEN_KEY, value);
      }`,
      'const AUTH_HEADER = "Authorization"; const AUTH_VALUE = `Bearer ${token}`; headers.append(AUTH_HEADER, AUTH_VALUE)',
      'const TOKEN_KEY = "auth_token"; const STORAGE = window.localStorage; STORAGE.setItem(TOKEN_KEY, token)',
    ];
    const allowed = [
      `const TOKEN_KEY = "auth_token";
      function storePreference(TOKEN_KEY: string, value: string) {
        localStorage.setItem(TOKEN_KEY, value);
      }`,
      `const TOKEN_KEY = "auth_token";
      function storeTheme(value: string) {
        const TOKEN_KEY = "theme";
        localStorage.setItem(TOKEN_KEY, value);
      }`,
      `const TOKEN_KEY = "auth_token";
      {
        const TOKEN_KEY = "theme";
        localStorage.setItem(TOKEN_KEY, value);
      }`,
      'const AUTH_HEADER = "Authorization"; headers.append(AUTH_HEADER, "Bearer pk_example")',
      'const docs = "Bearer YOUR_API_KEY"',
    ];

    for (const fixture of prohibited) expect(tenantCredentialViolations(fixture), fixture).not.toEqual([]);
    for (const fixture of allowed) expect(tenantCredentialViolations(fixture), fixture).toEqual([]);
  });

  it("does not persist tenant credentials or construct tenant Bearer headers outside Task 6 admin code", async () => {
    const files = (await sourceFiles(clientRoot)).filter((file) => !isTaskSixAdminBoundary(file.relative));
    const violations = files.flatMap((file) =>
      tenantCredentialViolations(file.source).map((pattern) => `${file.relative}:${pattern}`),
    );
    const tenantConsumers = files.filter((file) => file.relative !== "lib/auth.ts");

    expect(violations).toEqual([]);
    expect(tenantConsumers.map((file) => file.source).join("\n")).not.toMatch(/\bsetAuthToken\(/);
  });

  it("keeps public session pages on the explicit public helper", async () => {
    const files = await sourceFiles(clientRoot);
    for (const relative of publicSessionPages) {
      const source = files.find((file) => file.relative === relative)?.source ?? "";
      expect(source, relative).toContain("publicApiRequest");
      expect(source, relative).not.toMatch(/\bapiRequest\b/);
      expect(source, relative).not.toMatch(/\bfetch\(/);
    }
  });

  it("requires cookie credentials in both first-party request abstractions", async () => {
    const sessionSource = await readFile(path.join(clientRoot, "lib/session.ts"), "utf8");
    const rawRequestSource = sessionSource.slice(
      sessionSource.indexOf("const rawRequest"),
      sessionSource.indexOf("const performRefresh"),
    );
    const publicRequestSource = sessionSource.slice(
      sessionSource.indexOf("const publicApiRequest"),
      sessionSource.indexOf("const bootstrap"),
    );

    expect(rawRequestSource).toMatch(/dependencies\.fetch\(url,\s*\{[^}]*credentials:\s*["']include["'][^}]*\}\)/);
    expect(publicRequestSource).toContain("rawRequest(method, url, data)");
    expect(publicRequestSource).not.toMatch(/ensureCsrfToken|refreshSession/);
  });

  it("keeps the landing page neutral until session bootstrap resolves", async () => {
    const landing = await readFile(path.join(clientRoot, "pages/landing.tsx"), "utf8");

    expect(landing).toContain('session.status !== "unauthenticated"');
    expect(landing.indexOf('session.status !== "unauthenticated"')).toBeLessThan(landing.indexOf('data-testid="img-header-logo"'));
  });
});
