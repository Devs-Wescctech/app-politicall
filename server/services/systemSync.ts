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
    // Usar pg_dump com a URL do banco
    await execAsync(`pg_dump "${databaseUrl}" --no-owner --no-acl > "${dumpPath}"`, {
      timeout: 300000, // 5 minutos
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
    
    // Adicionar diretórios relevantes
    const includeDirs = ["client", "server", "shared"];
    const includeFiles = [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tailwind.config.ts",
      "postcss.config.js",
      "drizzle.config.ts",
      "vite.config.ts",
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
      
      // Adicionar dump do banco se solicitado
      if (config.includeDatabaseDump !== false) {
        const dumpPath = await createDatabaseDump(tempDir);
        archive.file(dumpPath, { name: "database_dump.sql" });
      }
      
      // Adicionar código se solicitado
      if (config.includeCode !== false) {
        const codePath = await createCodeArchive(tempDir);
        archive.file(codePath, { name: "code_archive.zip" });
      }
      
      // Adicionar metadados
      const metadata = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        source: "politicall",
        includesDatabase: config.includeDatabaseDump !== false,
        includesCode: config.includeCode !== false,
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });
      
      // Script de instalação
      const installScript = `#!/bin/bash
# Script de instalação do pacote Politicall
# Desenvolvido por David Flores Andrade - www.politicall.com.br

echo "🚀 Iniciando instalação do pacote Politicall..."

# Extrair código se existir
if [ -f "code_archive.zip" ]; then
  echo "📦 Extraindo código-fonte..."
  unzip -o code_archive.zip -d ./
  rm code_archive.zip
fi

# Restaurar banco se existir
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
 * Executa a sincronização completa
 */
export async function executeSystemSync(config: SyncConfig): Promise<SyncResult> {
  const startTime = Date.now();
  let tempDir: string | null = null;
  
  try {
    // Validar configuração
    if (!config.targetUrl) {
      throw new Error("URL do servidor destino não configurada");
    }
    if (!config.apiKey) {
      throw new Error("Chave de API não configurada");
    }
    
    // Criar diretório temporário
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "politicall-sync-"));
    
    console.log("📦 Criando pacote de sincronização...");
    
    // Criar pacote de sincronização
    const packagePath = await createSyncPackage(tempDir, config);
    const packageStats = fs.statSync(packagePath);
    
    console.log(`📤 Enviando pacote (${(packageStats.size / 1024 / 1024).toFixed(2)} MB)...`);
    
    // Enviar para servidor destino
    await sendPackageToTarget(packagePath, config);
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      message: "Sincronização concluída com sucesso",
      timestamp: new Date().toISOString(),
      details: {
        databaseSize: config.includeDatabaseDump !== false ? "incluído" : "não incluído",
        codeSize: `${(packageStats.size / 1024 / 1024).toFixed(2)} MB`,
        targetUrl: config.targetUrl.replace(/\/[^/]*$/, "/***"), // Ocultar parte da URL
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
    // Limpar arquivos temporários
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
