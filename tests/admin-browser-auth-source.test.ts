import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(process.cwd(), "client/src");
const forbiddenCredentialNames = new Set(["admin_token", "auth_token", "x-admin-token"]);

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [target] : [];
  });
}

function resolveConstExpression(expression: ts.Expression, checker: ts.TypeChecker, seen = new Set<ts.Symbol>()): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
    return resolveConstExpression(expression.expression, checker, seen);
  }
  if (!ts.isIdentifier(expression)) return expression;
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || seen.has(symbol)) return expression;
  const declaration = symbol.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer
    || !ts.isVariableDeclarationList(declaration.parent) || (declaration.parent.flags & ts.NodeFlags.Const) === 0) return expression;
  const nextSeen = new Set(seen);
  nextSeen.add(symbol);
  return resolveConstExpression(declaration.initializer, checker, nextSeen);
}

function staticString(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isStringLiteralLike(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return resolved.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, checker);
    const right = staticString(resolved.right, checker);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function staticPrefix(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isStringLiteralLike(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return resolved.text;
  if (ts.isTemplateExpression(resolved)) return resolved.head.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, checker);
    return left === undefined ? staticPrefix(resolved.left, checker) : left + (staticPrefix(resolved.right, checker) ?? "");
  }
  return undefined;
}

function propertyName(name: ts.PropertyName, checker: ts.TypeChecker): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return ts.isComputedPropertyName(name) ? staticString(name.expression, checker) : undefined;
}

function isBrowserStorage(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  const resolved = resolveConstExpression(expression, checker);
  if (ts.isIdentifier(resolved)) return resolved.text === "localStorage" || resolved.text === "sessionStorage";
  if (ts.isPropertyAccessExpression(resolved)) {
    return ts.isIdentifier(resolved.expression) && resolved.expression.text === "window"
      && (resolved.name.text === "localStorage" || resolved.name.text === "sessionStorage");
  }
  return ts.isElementAccessExpression(resolved) && ts.isIdentifier(resolved.expression) && resolved.expression.text === "window"
    && !!resolved.argumentExpression && ["localStorage", "sessionStorage"].includes(staticString(resolved.argumentExpression, checker) ?? "");
}

function assignedHeaderName(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return ts.isElementAccessExpression(expression) && expression.argumentExpression
    ? staticString(expression.argumentExpression, checker)
    : undefined;
}

function createAnalysis(source: string): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
  const fileName = "admin-source.tsx";
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host: ts.CompilerHost = {
    fileExists: (requested) => requested === fileName,
    getCanonicalFileName: (requested) => requested,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (requested) => requested === fileName ? sourceFile : undefined,
    readFile: (requested) => requested === fileName ? source : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
  const program = ts.createProgram([fileName], { jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest }, host);
  return { sourceFile: program.getSourceFile(fileName) ?? sourceFile, checker: program.getTypeChecker() };
}

function adminCredentialViolations(source: string): string[] {
  const { sourceFile, checker } = createAnalysis(source);
  const violations: string[] = [];
  const report = (node: ts.Node, kind: string) => violations.push(`${kind}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
  const isForbiddenName = (value: string) => forbiddenCredentialNames.has(value.toLowerCase());
  const isForbiddenBearer = (expression: ts.Expression) => /^\s*Bearer\s+/i.test(staticPrefix(expression, checker) ?? "");

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) && isForbiddenName(node.text)) report(node, "browser credential literal");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && isBrowserStorage(node.expression.expression, checker)
      && ["getItem", "setItem", "removeItem"].includes(node.expression.name.text)
      && node.arguments[0] && isForbiddenName(staticString(node.arguments[0], checker) ?? "")) report(node, "browser credential storage");
    if (ts.isElementAccessExpression(node) && isBrowserStorage(node.expression, checker)
      && node.argumentExpression && isForbiddenName(staticString(node.argumentExpression, checker) ?? "")) report(node, "browser credential property");
    if (ts.isPropertyAccessExpression(node) && isBrowserStorage(node.expression, checker)
      && isForbiddenName(node.name.text)) report(node, "browser credential property");
    if (ts.isPropertyAssignment(node) && propertyName(node.name, checker)?.toLowerCase() === "authorization"
      && isForbiddenBearer(node.initializer)) report(node, "first-party Bearer object");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ["set", "append"].includes(node.expression.name.text) && node.arguments[0] && node.arguments[1]
      && staticString(node.arguments[0], checker)?.toLowerCase() === "authorization" && isForbiddenBearer(node.arguments[1])) {
      report(node, `first-party Headers.${node.expression.name.text}`);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && assignedHeaderName(node.left, checker)?.toLowerCase() === "authorization" && isForbiddenBearer(node.right)) report(node, "first-party Bearer assignment");
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

describe("admin browser credential source gate", () => {
  it("detects conservative authorization and credential-storage mutations", () => {
    const prohibited = [
      'const KEY = "ADMIN" + "_TOKEN"; const store = window["localStorage"]; store.setItem(KEY, token)',
      'const key = "x-admin-token"; sessionStorage[key] = token',
      'const headers = { ["Author" + "ization"]: `Bearer ${token}` }',
      'const name = "AUTHORIZATION"; headers.set(name, `Bearer ${token}`)',
      'headers.append("authorization", "Bearer " + token)',
      'headers["Authorization"] = `Bearer ${token}`',
      'headers.authorization = `Bearer ${token}`',
      'const authorization = token; const headers = { authorization }',
      'const headers = new Headers([["Authorization", token]])',
      'localStorage["setItem"]("admin_token", token)',
      'const setAuthorization = headers.set.bind(headers); setAuthorization("Authorization", token)',
      'const headers = { Authorization: tokenFromHelper() }',
    ];
    for (const fixture of prohibited) expect(adminCredentialViolations(fixture), fixture).not.toEqual([]);
    expect(adminCredentialViolations('const theme = "theme"; localStorage.setItem(theme, value)')).toEqual([]);
    expect(adminCredentialViolations('const docs = "Bearer YOUR_API_KEY"')).toEqual([]);
    expect(adminCredentialViolations('const docs = "Bearer pk_example"')).toEqual([]);
    expect(adminCredentialViolations('const headers = new Headers([["X-Trace", buildTrace()]])')).toEqual([]);
    expect(adminCredentialViolations('localStorage["setItem"]("theme", value)')).toEqual([]);
  });

  it("rejects browser credential storage, X-Admin-Token, and first-party Bearer construction globally", () => {
    const sources = files(clientRoot).map((file) => ({ relative: path.relative(clientRoot, file), source: fs.readFileSync(file, "utf8") }));
    const violations = sources.flatMap((file) => adminCredentialViolations(file.source).map((violation) => `${file.relative}:${violation}`));
    expect(violations).toEqual([]);
  });

  it("requires authenticated-only admin queries, neutral guards, async login probing, and non-authoritative impersonation payloads", () => {
    const read = (relative: string) => fs.readFileSync(path.join(clientRoot, relative), "utf8");
    for (const relative of ["pages/admin.tsx", "pages/contracts.tsx"]) {
      const source = read(relative);
      expect(source).toContain('enabled: adminSession.status === "authenticated"');
      expect(source).toMatch(/adminSession\.status !== "authenticated"[\s\S]{0,160}return null/);
    }
    const login = read("pages/admin-login.tsx");
    expect(login).toContain("useAdminSession");
    expect(login).toContain('adminSession.status === "authenticated"');
    const settings = read("pages/settings.tsx");
    expect(settings).toMatch(/if \(data\.newPassword\)[\s\S]{0,180}payload\.newPassword = data\.newPassword/);
    expect(settings).toContain("sessionClient.logoutSession()");
    expect(settings).toContain('window.location.href = wasImpersonating ? "/contracts" : "/login"');

    const contracts = read("pages/contracts.tsx");
    const admin = read("pages/admin.tsx");
    expect(contracts).not.toMatch(/adminRequest\([\s\S]{0,220}if \(!response\.ok\)/);
    expect(admin).not.toMatch(/system-sync\/pull[\s\S]{0,220}if \(!response\.ok\)/);
  });
});
