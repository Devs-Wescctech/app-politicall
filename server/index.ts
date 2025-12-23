/**
 * ============================================================================
 * POLITICALL - Plataforma de Gestão Política
 * ============================================================================
 * 
 * Desenvolvido por: David Flores Andrade
 * Website: www.politicall.com.br
 * 
 * Todos os direitos reservados © 2024-2025
 * ============================================================================
 */

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { politicalParties, accounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

// Serve uploaded assets
app.use('/assets', express.static('attached_assets'));

// Serve user uploads (avatars, backgrounds)
app.use('/uploads', express.static('uploads'));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// SSR route for alliance invite with dynamic Open Graph meta tags
// Only serves static HTML with OG tags for crawlers (WhatsApp, Facebook, Twitter, etc.)
// Regular browsers get the normal SPA experience via Vite
app.get("/convite-alianca/:token", async (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.headers['user-agent'] || '';
  const crawlerPatterns = [
    'facebookexternalhit',
    'Facebot',
    'WhatsApp',
    'Twitterbot',
    'LinkedInBot',
    'Pinterest',
    'Slackbot',
    'TelegramBot',
    'Discordbot',
    'Googlebot',
    'bingbot',
    'Applebot'
  ];
  
  const isCrawler = crawlerPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
  
  // Let regular browsers use the normal SPA via Vite
  if (!isCrawler) {
    return next();
  }
  
  try {
    const { token } = req.params;
    const invite = await storage.getAllianceInviteByToken(token);
    
    // Default meta tags
    let ogTitle = "Convite de Aliança Política";
    let ogDescription = "Você foi convidado para fazer parte de uma aliança política.";
    let ogImage = "https://www.politicall.com.br/favicon.png";
    
    if (invite) {
      const inviter = await storage.getUser(invite.userId);
      const [party] = await db.select().from(politicalParties).where(eq(politicalParties.id, invite.partyId));
      const [account] = await db.select().from(accounts).where(eq(accounts.id, invite.accountId));
      const admin = await storage.getAccountAdmin(invite.accountId);
      
      // Build personalized meta tags
      if (account?.name) {
        ogTitle = `Convite de Aliança - ${account.name}`;
      } else if (admin?.name) {
        ogTitle = `Convite de Aliança - ${admin.name}`;
      }
      
      if (party) {
        ogDescription = `Você foi convidado(a) para fazer parte da aliança política pelo partido ${party.acronym} - ${party.name}.`;
      }
      
      // Use admin avatar as OG image if available
      // Skip data URLs as they don't work well with OG image crawlers
      if (admin?.avatar && !admin.avatar.startsWith('data:')) {
        ogImage = admin.avatar.startsWith('http') ? admin.avatar : `https://www.politicall.com.br${admin.avatar}`;
      } else if (inviter?.avatar && !inviter.avatar.startsWith('data:')) {
        ogImage = inviter.avatar.startsWith('http') ? inviter.avatar : `https://www.politicall.com.br${inviter.avatar}`;
      }
    }
    
    // Read and modify index.html
    const indexPath = path.resolve("client", "index.html");
    
    let html = fs.readFileSync(indexPath, "utf-8");
    
    // Inject Open Graph meta tags before </head>
    const ogTags = `
    <!-- Dynamic Open Graph Meta Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.politicall.com.br/convite-alianca/${token}" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:site_name" content="Politicall" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="icon" type="image/png" href="${ogImage}" />
  `;
    
    // Replace title
    html = html.replace(/<title>.*?<\/title>/, `<title>${ogTitle}</title>`);
    
    // Replace description
    html = html.replace(
      /<meta name="description" content=".*?" \/>/,
      `<meta name="description" content="${ogDescription}" />`
    );
    
    // Inject OG tags before </head>
    html = html.replace('</head>', `${ogTags}</head>`);
    
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (error) {
    log(`SSR error for /convite-alianca/:token: ${error}`);
    return res.status(500).send("Erro ao carregar página de convite");
  }
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Configure timeouts for file uploads
  server.keepAliveTimeout = 120000; // 2 minutes
  server.headersTimeout = 125000; // slightly more than keepAlive
  server.timeout = 300000; // 5 minutes for large uploads
  
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
