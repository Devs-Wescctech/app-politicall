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

function resolveConstExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>(),
): ts.Expression {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)) {
    return resolveConstExpression(expression.expression, checker, seen);
  }
  if (!ts.isIdentifier(expression)) return expression;
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || seen.has(symbol)) return expression;
  const declaration = symbol.valueDeclaration;
  if (!declaration
    || !ts.isVariableDeclaration(declaration)
    || !declaration.initializer
    || !ts.isVariableDeclarationList(declaration.parent)
    || (declaration.parent.flags & ts.NodeFlags.Const) === 0) return expression;
  const nextSeen = new Set(seen);
  nextSeen.add(symbol);
  return resolveConstExpression(declaration.initializer, checker, nextSeen);
}

function staticString(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isStringLiteralLike(resolved)) return resolved.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, checker);
    const right = staticString(resolved.right, checker);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function staticPrefix(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isStringLiteralLike(resolved)) return resolved.text;
  if (ts.isTemplateExpression(resolved)) return resolved.head.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, checker);
    if (left !== undefined) return left + (staticPrefix(resolved.right, checker) ?? "");
    return staticPrefix(resolved.left, checker);
  }
  return undefined;
}

function isForbiddenBearer(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isConditionalExpression(resolved)) {
    return isForbiddenBearer(resolved.whenTrue, checker)
      || isForbiddenBearer(resolved.whenFalse, checker);
  }
  const prefix = staticPrefix(resolved, checker);
  const match = prefix?.match(/^\s*Bearer\s+(\S*)/i);
  if (!match) return false;
  return match[1] !== "YOUR_API_KEY" && !match[1].startsWith("pk_");
}

function propertyName(
  name: ts.PropertyName,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return staticString(name.expression, checker);
  return undefined;
}

function isBrowserStorage(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isIdentifier(resolved)) {
    return resolved.text === "localStorage" || resolved.text === "sessionStorage";
  }
  if (ts.isPropertyAccessExpression(resolved)) {
    return ts.isIdentifier(resolved.expression)
      && resolved.expression.text === "window"
      && (resolved.name.text === "localStorage" || resolved.name.text === "sessionStorage");
  }
  if (ts.isElementAccessExpression(resolved) && ts.isIdentifier(resolved.expression) && resolved.expression.text === "window") {
    const storageName = resolved.argumentExpression && staticString(resolved.argumentExpression, checker);
    return storageName === "localStorage" || storageName === "sessionStorage";
  }
  return false;
}

function assignedHeaderName(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
    return staticString(expression.argumentExpression, checker);
  }
  return undefined;
}

function createSourceAnalysis(source: string): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
} {
  const fileName = "tenant-source.tsx";
  const compilerOptions: ts.CompilerOptions = {
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    compilerOptions.target ?? ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const host: ts.CompilerHost = {
    fileExists: (requestedFileName) => requestedFileName === fileName,
    getCanonicalFileName: (requestedFileName) => requestedFileName,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (requestedFileName) => requestedFileName === fileName ? sourceFile : undefined,
    readFile: (requestedFileName) => requestedFileName === fileName ? source : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
  const program = ts.createProgram([fileName], compilerOptions, host);
  return {
    sourceFile: program.getSourceFile(fileName) ?? sourceFile,
    checker: program.getTypeChecker(),
  };
}

function tenantCredentialViolations(source: string): string[] {
  const { sourceFile, checker } = createSourceAnalysis(source);
  const violations: string[] = [];
  const report = (node: ts.Node, kind: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${kind}:${line + 1}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && isBrowserStorage(node.expression.expression, checker)
      && ["getItem", "setItem", "removeItem"].includes(node.expression.name.text)
      && node.arguments[0]
      && staticString(node.arguments[0], checker) === "auth_token") {
      report(node, "browser auth_token storage");
    }

    if (ts.isElementAccessExpression(node)
      && isBrowserStorage(node.expression, checker)
      && node.argumentExpression
      && staticString(node.argumentExpression, checker) === "auth_token") {
      report(node, "browser auth_token property");
    }

    if (ts.isPropertyAccessExpression(node)
      && isBrowserStorage(node.expression, checker)
      && node.name.text === "auth_token") {
      report(node, "browser auth_token property");
    }

    if (ts.isPropertyAssignment(node)
      && propertyName(node.name, checker)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.initializer, checker)) {
      report(node, "tenant bearer object");
    }

    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ["set", "append"].includes(node.expression.name.text)
      && node.arguments[0]
      && node.arguments[1]
      && staticString(node.arguments[0], checker)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.arguments[1], checker)) {
      report(node, `tenant bearer Headers.${node.expression.name.text}`);
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && assignedHeaderName(node.left, checker)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.right, checker)) {
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
