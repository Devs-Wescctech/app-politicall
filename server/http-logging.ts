import type { NextFunction, Request, Response } from "express";

type LogFunction = (message: string) => void;
type Clock = () => number;

export function createApiRequestLogger(log: LogFunction, now: Clock = Date.now) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = now();

    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;

      const duration = now() - start;
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    });

    next();
  };
}
