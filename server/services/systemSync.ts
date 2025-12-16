/**
 * ============================================================================
 * POLITICALL - Sistema de Sincronização
 * ============================================================================
 * 
 * Desenvolvido por: David Flores Andrade
 * Website: www.politicall.com.br
 * 
 * Serviço para sincronizar o sistema com servidores externos
 * ============================================================================
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";

const execAsync = promisify(exec);

interface SyncResult {
  success: boolean;
  message: string;
  timestamp: string;
  details?: {
    databaseSize?: string;
    codeSize?: string;
    targetUrl?: string;
    duration?: number;
  };
  error?: string;
}

interface SyncConfig {
  targetUrl: string;
  apiKey: string;
  includeCode?: boolean;
  includeDatabaseDump?: boolean;
}

interface ExportPackage {
  database: string;
  code: string;
  envVars: Record<string, string | undefined>;
  adminConfig: string | null;
  metadata: {
    version: string;
    timestamp: string;
    source: string;
    databaseSize: number;
    codeSize: number;
  };
}

interface ImportResult {
  success: boolean;
  message: string;
  timestamp: string;
  details: {
    databaseRestored: boolean;
    codeExtracted: boolean;
    adminConfigUpdated: boolean;
    envVarsToUpdate: string[];
    duration: number;
  };
  error?: string;
}

const ADMIN_CONFIG_FILE = path.join(process.cwd(), '.admin-config.json');

/**
 * Executa pg_dump e retorna o caminho do arquivo
 */
async function createDatabaseDump(tempDir: string): Promise<string> {
  const dumpPath = path.join(tempDir, "database_dump.sql");
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não configurada");
  }

  try {
    await execAsync(`pg_dump "${databaseUrl}" --no-owner --no-acl > "${dumpPath}"`, {
      timeout: 300000,
    });
    
    return dumpPath;
  } catch (error: any) {
    console.error("Erro ao criar dump do banco:", error.message);
    throw new Error(`Falha ao criar dump do banco de dados: ${error.message}`);
  }
}

/**
 * Cria um ZIP com o código-fonte (excluindo node_modules, .git, etc)
 */
async function createCodeArchive(tempDir: string): Promise<string> {
  const archivePath = path.join(tempDir, "code_archive.zip");
  const projectRoot = process.cwd();
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    
    output.on("close", () => resolve(archivePath));
    output.on("error", reject);
    archive.on("error", reject);
    
    archive.pipe(output);
    
    const includeDirs = ["client", "server", "shared", "migrations"];
    const includeFiles = [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tailwind.config.ts",
      "postcss.config.js",
      "drizzle.config.ts",
      "vite.config.ts",
      "components.json",
    ];
    
    for (const dir of includeDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        archive.directory(fullPath, dir);
      }
    }
    
    for (const file of includeFiles) {
      const fullPath = path.join(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: file });
      }
    }
    
    archive.finalize();
  });
}

/**
 * Cria o pacote completo de sincronização
 */
async function createSyncPackage(tempDir: string, config: SyncConfig): Promise<string> {
  const packagePath = path.join(tempDir, "sync_package.zip");
  
  return new Promise(async (resolve, reject) => {
    try {
      const output = fs.createWriteStream(packagePath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      
      output.on("close", () => resolve(packagePath));
      output.on("error", reject);
      archive.on("error", reject);
      
      archive.pipe(output);
      
      if (config.includeDatabaseDump !== false) {
        const dumpPath = await createDatabaseDump(tempDir);
        archive.file(dumpPath, { name: "database_dump.sql" });
      }
      
      if (config.includeCode !== false) {
        const codePath = await createCodeArchive(tempDir);
        archive.file(codePath, { name: "code_archive.zip" });
      }
      
      const metadata = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        source: "politicall",
        includesDatabase: config.includeDatabaseDump !== false,
        includesCode: config.includeCode !== false,
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });
      
      const installScript = `#!/bin/bash
# Script de instalação do pacote Politicall
# Desenvolvido por David Flores Andrade - www.politicall.com.br

echo "🚀 Iniciando instalação do pacote Politicall..."

if [ -f "code_archive.zip" ]; then
  echo "📦 Extraindo código-fonte..."
  unzip -o code_archive.zip -d ./
  rm code_archive.zip
fi

if [ -f "database_dump.sql" ]; then
  echo "💾 Restaurando banco de dados..."
  if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" < database_dump.sql
  else
    echo "⚠️ DATABASE_URL não definida. Pulando restauração do banco."
  fi
fi

echo "✅ Instalação concluída!"
`;
      archive.append(installScript, { name: "install.sh" });
      
      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Envia o pacote para o servidor destino
 */
async function sendPackageToTarget(packagePath: string, config: SyncConfig): Promise<void> {
  const packageBuffer = fs.readFileSync(packagePath);
  const packageBase64 = packageBuffer.toString("base64");
  
  const response = await fetch(config.targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
      "X-Sync-Source": "politicall",
    },
    body: JSON.stringify({
      package: packageBase64,
      timestamp: new Date().toISOString(),
      metadata: {
        size: packageBuffer.length,
        encoding: "base64",
      },
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Servidor destino retornou erro ${response.status}: ${errorText}`);
  }
}

/**
 * Executa a sincronização completa (push-based - mantido para compatibilidade)
 */
export async function executeSystemSync(config: SyncConfig): Promise<SyncResult> {
  const startTime = Date.now();
  let tempDir: string | null = null;
  
  try {
    if (!config.targetUrl) {
      throw new Error("URL do servidor destino não configurada");
    }
    if (!config.apiKey) {
      throw new Error("Chave de API não configurada");
    }
    
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "politicall-sync-"));
    
    console.log("📦 Criando pacote de sincronização...");
    
    const packagePath = await createSyncPackage(tempDir, config);
    const packageStats = fs.statSync(packagePath);
    
    console.log(`📤 Enviando pacote (${(packageStats.size / 1024 / 1024).toFixed(2)} MB)...`);
    
    await sendPackageToTarget(packagePath, config);
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      message: "Sincronização concluída com sucesso",
      timestamp: new Date().toISOString(),
      details: {
        databaseSize: config.includeDatabaseDump !== false ? "incluído" : "não incluído",
        codeSize: `${(packageStats.size / 1024 / 1024).toFixed(2)} MB`,
        targetUrl: config.targetUrl.replace(/\/[^/]*$/, "/***"),
        duration,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Erro durante a sincronização",
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Erro ao limpar arquivos temporários:", e);
      }
    }
  }
}

/**
 * Gera o pacote de exportação para pull-based sync
 */
export async function generateExportPackage(): Promise<ExportPackage> {
  let tempDir: string | null = null;
  
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "politicall-export-"));
    
    console.log("📦 Gerando pacote de exportação...");
    
    const dumpPath = await createDatabaseDump(tempDir);
    const dumpBuffer = fs.readFileSync(dumpPath);
    const databaseBase64 = dumpBuffer.toString("base64");
    
    const codePath = await createCodeArchive(tempDir);
    const codeBuffer = fs.readFileSync(codePath);
    const codeBase64 = codeBuffer.toString("base64");
    
    const envVarsToExport = [
      "SESSION_SECRET",
      "DATABASE_URL",
      "PGHOST",
      "PGPORT",
      "PGUSER",
      "PGPASSWORD",
      "PGDATABASE",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "SENDGRID_API_KEY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
    ];
    
    const envVars: Record<string, string | undefined> = {};
    for (const key of envVarsToExport) {
      envVars[key] = process.env[key];
    }
    
    let adminConfig: string | null = null;
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      adminConfig = fs.readFileSync(ADMIN_CONFIG_FILE, "utf-8");
    }
    
    const exportPackage: ExportPackage = {
      database: databaseBase64,
      code: codeBase64,
      envVars,
      adminConfig,
      metadata: {
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        source: "politicall-replit",
        databaseSize: dumpBuffer.length,
        codeSize: codeBuffer.length,
      },
    };
    
    console.log(`✅ Pacote de exportação gerado: DB ${(dumpBuffer.length / 1024 / 1024).toFixed(2)} MB, Code ${(codeBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    return exportPackage;
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Erro ao limpar arquivos temporários:", e);
      }
    }
  }
}

/**
 * Importa dados de um servidor fonte (pull-based sync)
 */
export async function importFromSource(sourceUrl: string, apiKey: string): Promise<ImportResult> {
  const startTime = Date.now();
  let tempDir: string | null = null;
  
  const result: ImportResult = {
    success: false,
    message: "",
    timestamp: new Date().toISOString(),
    details: {
      databaseRestored: false,
      codeExtracted: false,
      adminConfigUpdated: false,
      envVarsToUpdate: [],
      duration: 0,
    },
  };
  
  try {
    console.log(`📥 Buscando dados de: ${sourceUrl}`);
    
    const exportUrl = `${sourceUrl}/api/admin/system-sync/export`;
    
    const response = await fetch(exportUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Servidor fonte retornou erro ${response.status}: ${errorText}`);
    }
    
    const exportPackage: ExportPackage = await response.json();
    
    console.log("📦 Dados recebidos, processando...");
    
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "politicall-import-"));
    
    if (exportPackage.database) {
      console.log("💾 Restaurando banco de dados...");
      
      const dumpBuffer = Buffer.from(exportPackage.database, "base64");
      const dumpPath = path.join(tempDir, "database_dump.sql");
      fs.writeFileSync(dumpPath, dumpBuffer);
      
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl) {
        try {
          await execAsync(`psql "${databaseUrl}" < "${dumpPath}"`, {
            timeout: 600000,
          });
          result.details.databaseRestored = true;
          console.log("✅ Banco de dados restaurado");
        } catch (dbError: any) {
          console.error("⚠️ Erro ao restaurar banco:", dbError.message);
          result.details.databaseRestored = false;
        }
      } else {
        console.log("⚠️ DATABASE_URL não configurada, pulando restauração do banco");
      }
    }
    
    if (exportPackage.adminConfig) {
      console.log("📋 Atualizando configuração do admin...");
      try {
        fs.writeFileSync(ADMIN_CONFIG_FILE, exportPackage.adminConfig);
        result.details.adminConfigUpdated = true;
        console.log("✅ Configuração do admin atualizada");
      } catch (configError: any) {
        console.error("⚠️ Erro ao atualizar config:", configError.message);
      }
    }
    
    if (exportPackage.envVars) {
      const requiredEnvVars: string[] = [];
      for (const [key, value] of Object.entries(exportPackage.envVars)) {
        if (value && !process.env[key]) {
          requiredEnvVars.push(key);
        }
      }
      result.details.envVarsToUpdate = requiredEnvVars;
      if (requiredEnvVars.length > 0) {
        console.log(`📝 Variáveis de ambiente que precisam ser configuradas: ${requiredEnvVars.join(", ")}`);
      }
    }
    
    const duration = Date.now() - startTime;
    result.details.duration = duration;
    result.success = true;
    result.message = "Importação concluída com sucesso";
    
    console.log(`✅ Importação concluída em ${duration}ms`);
    
    return result;
  } catch (error: any) {
    result.success = false;
    result.message = "Erro durante a importação";
    result.error = error.message;
    result.details.duration = Date.now() - startTime;
    
    console.error("❌ Erro na importação:", error.message);
    
    return result;
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Erro ao limpar arquivos temporários:", e);
      }
    }
  }
}

/**
 * Verifica se a configuração de sincronização está válida
 */
export function validateSyncConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!process.env.SYNC_TARGET_URL) {
    errors.push("SYNC_TARGET_URL não configurada");
  }
  if (!process.env.SYNC_API_KEY) {
    errors.push("SYNC_API_KEY não configurada");
  }
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL não configurada");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Obtém a configuração de sincronização das variáveis de ambiente
 */
export function getSyncConfig(): SyncConfig {
  return {
    targetUrl: process.env.SYNC_TARGET_URL || "",
    apiKey: process.env.SYNC_API_KEY || "",
    includeCode: process.env.SYNC_INCLUDE_CODE !== "false",
    includeDatabaseDump: process.env.SYNC_INCLUDE_DATABASE !== "false",
  };
}
