import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(process.cwd(), "client/src");
const normalizedClientRoot = clientRoot.replace(/\\/g, "/");
const forbiddenCredentialNames = new Set(["admin_token", "auth_token", "X-Admin-Token"]);

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [target] : [];
  });
}

function staticString(node: ts.Expression, checker: ts.TypeChecker): string | undefined {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isIdentifier(node)) {
    const declaration = node.symbol ?? checker.getSymbolAtLocation(node);
    const value = declaration?.valueDeclaration;
    if (value && ts.isVariableDeclaration(value) && value.initializer) return staticString(value.initializer, checker);
  }
  return undefined;
}

describe("admin browser credential source gate", () => {
  it("rejects browser credential storage, X-Admin-Token, and first-party Bearer construction through aliases", () => {
    const program = ts.createProgram(files(clientRoot), { allowJs: false, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 });
    const checker = program.getTypeChecker();
    const violations: string[] = [];

    for (const source of program.getSourceFiles()) {
      if (!source.fileName.replace(/\\/g, "/").startsWith(normalizedClientRoot)) continue;
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node) && forbiddenCredentialNames.has(node.text)) {
          violations.push(`${path.relative(clientRoot, source.fileName)}:${node.getStart(source)}:${node.text}`);
        }
        if (ts.isPropertyAssignment(node)) {
          const key = ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text.toLowerCase() : "";
          const value = staticString(node.initializer, checker);
          if (key === "authorization" && value?.startsWith("Bearer ") && !value.startsWith("Bearer pk_") && !value.startsWith("Bearer YOUR_API_KEY")) {
            violations.push(`${path.relative(clientRoot, source.fileName)}:${node.getStart(source)}:first-party Bearer`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(violations).toEqual([]);
  });
});
