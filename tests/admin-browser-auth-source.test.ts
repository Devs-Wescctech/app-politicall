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

function staticString(expression: ts.Expression, checker: ts.TypeChecker, seen = new Set<ts.Node>()): string | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (seen.has(resolved)) return undefined;
  const nextSeen = new Set(seen);
  nextSeen.add(resolved);
  if (ts.isStringLiteralLike(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return resolved.text;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(resolved.left, checker, nextSeen);
    const right = staticString(resolved.right, checker, nextSeen);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const key = ts.isPropertyAccessExpression(resolved)
    ? resolved.name.text
    : ts.isElementAccessExpression(resolved) && resolved.argumentExpression
      ? staticString(resolved.argumentExpression, checker, nextSeen)
      : undefined;
  if (key !== undefined && (ts.isPropertyAccessExpression(resolved) || ts.isElementAccessExpression(resolved))) {
    const object = resolveConstExpression(resolved.expression, checker);
    if (!ts.isObjectLiteralExpression(object)) return undefined;
    const property = object.properties.find((candidate) =>
      ts.isPropertyAssignment(candidate) && propertyName(candidate.name, checker) === key);
    return property && ts.isPropertyAssignment(property)
      ? staticString(property.initializer, checker, nextSeen)
      : undefined;
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

function memberName(expression: ts.Expression, checker: ts.TypeChecker): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return ts.isElementAccessExpression(expression) && expression.argumentExpression
    ? staticString(expression.argumentExpression, checker)
    : undefined;
}

function isBoundHeaderMutator(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  const resolved = resolveConstExpression(expression, checker);
  return ts.isCallExpression(resolved)
    && ts.isPropertyAccessExpression(resolved.expression)
    && resolved.expression.name.text === "bind"
    && ts.isPropertyAccessExpression(resolved.expression.expression)
    && ["set", "append"].includes(resolved.expression.expression.name.text);
}

function isAuthorizationHeader(value: string | undefined): boolean {
  return value?.toLowerCase() === "authorization";
}

function isAllowedProviderAuthorizationMetadata(node: ts.Node, relative: string, checker: ts.TypeChecker): boolean {
  return relative === "components/admin/AdminIntegrationsDialog.tsx"
    && ts.isStringLiteralLike(node)
    && ts.isPropertyAssignment(node.parent)
    && propertyName(node.parent.name, checker) === "locawebAuthHeader";
}

function headersValue(expression: ts.Expression, checker: ts.TypeChecker): ts.Expression | undefined {
  const resolved = resolveConstExpression(expression, checker);
  if (!ts.isObjectLiteralExpression(resolved)) return undefined;
  const property = resolved.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate) && propertyName(candidate.name, checker)?.toLowerCase() === "headers");
  return property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
}

function hasAuthorizationEntry(expression: ts.Expression, checker: ts.TypeChecker, seen = new Set<ts.Node>()): boolean {
  const resolved = resolveConstExpression(expression, checker);
  if (seen.has(resolved)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(resolved);
  if (isAuthorizationHeader(staticString(resolved, checker))) return true;
  if (ts.isArrayLiteralExpression(resolved)) return resolved.elements.some((element) => ts.isExpression(element) && hasAuthorizationEntry(element, checker, nextSeen));
  if (ts.isObjectLiteralExpression(resolved)) return resolved.properties.some((property) =>
    (ts.isPropertyAssignment(property) && (isAuthorizationHeader(propertyName(property.name, checker)) || hasAuthorizationEntry(property.initializer, checker, nextSeen)))
    || (ts.isShorthandPropertyAssignment(property) && isAuthorizationHeader(property.name.text)));
  if (ts.isNewExpression(resolved) && ts.isIdentifier(resolved.expression) && ["Headers", "Map"].includes(resolved.expression.text)) {
    return (resolved.arguments ?? []).some((argument) => hasAuthorizationEntry(argument, checker, nextSeen));
  }
  if (ts.isCallExpression(resolved) && ts.isPropertyAccessExpression(resolved.expression)
    && ts.isIdentifier(resolved.expression.expression) && resolved.expression.expression.text === "Object"
    && resolved.expression.name.text === "fromEntries") {
    return resolved.arguments.some((argument) => hasAuthorizationEntry(argument, checker, nextSeen));
  }
  return false;
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

function adminCredentialViolations(source: string, relative = "fixture.tsx"): string[] {
  const { sourceFile, checker } = createAnalysis(source);
  const violations: string[] = [];
  const report = (node: ts.Node, kind: string) => violations.push(`${kind}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
  const isForbiddenName = (value: string) => forbiddenCredentialNames.has(value.toLowerCase());

  const visit = (node: ts.Node) => {
    if (ts.isExpression(node) && isAuthorizationHeader(staticString(node, checker))
      && !isAllowedProviderAuthorizationMetadata(node, relative, checker)) report(node, "executable Authorization");
    if (ts.isStringLiteralLike(node) && isForbiddenName(node.text)) report(node, "browser credential literal");
    if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
      && isBrowserStorage(node.expression.expression, checker)
      && ["getItem", "setItem", "removeItem"].includes(memberName(node.expression, checker) ?? "")
      && node.arguments[0] && isForbiddenName(staticString(node.arguments[0], checker) ?? "")) report(node, "browser credential storage");
    if (ts.isElementAccessExpression(node) && isBrowserStorage(node.expression, checker)
      && node.argumentExpression && isForbiddenName(staticString(node.argumentExpression, checker) ?? "")) report(node, "browser credential property");
    if (ts.isPropertyAccessExpression(node) && isBrowserStorage(node.expression, checker)
      && isForbiddenName(node.name.text)) report(node, "browser credential property");
    if (ts.isPropertyAssignment(node) && isAuthorizationHeader(propertyName(node.name, checker))) report(node, "Authorization object");
    if (ts.isShorthandPropertyAssignment(node) && isAuthorizationHeader(node.name.text)) report(node, "Authorization shorthand");
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Headers") {
      const tuples = node.arguments?.[0];
      if (tuples && ts.isArrayLiteralExpression(tuples) && tuples.elements.some((tuple) =>
        ts.isArrayLiteralExpression(tuple) && tuple.elements[0] && ts.isExpression(tuple.elements[0])
          && isAuthorizationHeader(staticString(tuple.elements[0], checker)))) report(node, "Authorization Headers tuple");
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
      const headers = node.arguments[1] && headersValue(node.arguments[1], checker);
      if (headers && hasAuthorizationEntry(headers, checker)) report(node, "Authorization fetch HeadersInit");
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Request") {
      const headers = node.arguments?.[1] && headersValue(node.arguments[1], checker);
      if (headers && hasAuthorizationEntry(headers, checker)) report(node, "Authorization Request HeadersInit");
    }
    if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
      && ["set", "append"].includes(memberName(node.expression, checker) ?? "") && node.arguments[0]
      && isAuthorizationHeader(staticString(node.arguments[0], checker))) {
      report(node, `Authorization Headers.${memberName(node.expression, checker)}`);
    }
    if (ts.isCallExpression(node) && isBoundHeaderMutator(node.expression, checker) && node.arguments[0]
      && isAuthorizationHeader(staticString(node.arguments[0], checker))) {
      report(node, "Authorization bound Headers mutator");
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && isAuthorizationHeader(assignedHeaderName(node.left, checker))) report(node, "Authorization assignment");
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
      'fetch("/api", { headers: [["Authorization", token]] })',
      'new Request("/api", { headers: { Authorization: token } })',
      'const headerEntries = [["Author" + "ization", token]]; fetch("/api", { headers: headerEntries })',
      'fetch("/api", { headers: new Map([["Authorization", token]]) })',
      'new Request("/api", { headers: Object.fromEntries([["Authorization", token]]) })',
    ];
    for (const fixture of prohibited) expect(adminCredentialViolations(fixture), fixture).not.toEqual([]);
    expect(adminCredentialViolations('const theme = "theme"; localStorage.setItem(theme, value)')).toEqual([]);
    expect(adminCredentialViolations('const docs = "Bearer YOUR_API_KEY"')).toEqual([]);
    expect(adminCredentialViolations('const docs = "Bearer pk_example"')).toEqual([]);
    expect(adminCredentialViolations('const headers = new Headers([["X-Trace", buildTrace()]])')).toEqual([]);
    expect(adminCredentialViolations('localStorage["setItem"]("theme", value)')).toEqual([]);
    expect(adminCredentialViolations('<p>Authorization</p>')).toEqual([]);
    const locawebSource = 'const config = { locawebAuthHeader: "Authorization" }';
    for (const fixture of [
      locawebSource,
      `${locawebSource}; const { locawebAuthHeader } = config; fetch('/api/admin/users', { headers: [[locawebAuthHeader, token]] })`,
      `${locawebSource}; const { locawebAuthHeader, ...rest } = config; fetch('/api/admin/users', { headers: [[rest.locawebAuthHeader, token]] })`,
      `${locawebSource}; const clone = { ...config }; fetch('/api/admin/users', { headers: [[clone.locawebAuthHeader, token]] })`,
    ]) expect(adminCredentialViolations(fixture), fixture).not.toEqual([]);
  });

  it("rejects browser credential storage, X-Admin-Token, and first-party Bearer construction globally", () => {
    const sources = files(clientRoot).map((file) => ({ relative: path.relative(clientRoot, file).replaceAll("\\", "/"), source: fs.readFileSync(file, "utf8") }));
    const violations = sources.flatMap((file) => adminCredentialViolations(file.source, file.relative).map((violation) => `${file.relative}:${violation}`));
    expect(violations).toEqual([]);
    expect(fs.readFileSync(path.join(clientRoot, "components/admin/AdminIntegrationsDialog.tsx"), "utf8"))
      .not.toContain("locawebAuthHeader:");
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
