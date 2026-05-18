import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { healthRouter } from "./routes/health";
import { geminiRouter } from "./routes/gemini";
import { aiRouter } from "./routes/ai";
import { progressRouter } from "./routes/progress";
import { sourcesRouter } from "./routes/sources";
import { booksRouter } from "./routes/books";
import { BookService } from "./services/bookService";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const authCookieName = "learn_helper_auth";

// Initialize services
BookService.init().catch(console.error);

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increase limit for large text files/PDFs

// Simple Auth
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.AUTH_PASSWORD;
  console.log(`Auth attempt. Provided: "${password}", Expected: "${expectedPassword}"`);
  
  if (!expectedPassword || password === expectedPassword) {
    res.cookie(authCookieName, password || "authenticated", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const expectedPassword = process.env.AUTH_PASSWORD;
  if (!expectedPassword) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  const cookieToken = parseCookieHeader(req.headers.cookie || "")[authCookieName];
  if (authHeader === `Bearer ${expectedPassword}` || cookieToken === expectedPassword) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

function parseCookieHeader(cookieHeader: string) {
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, item) => {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex === -1) return cookies;

    const key = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();
    if (!key) return cookies;

    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

// Routes
app.use("/api/health", authMiddleware, healthRouter);
app.use("/api/gemini", authMiddleware, geminiRouter);
app.use("/api/progress", authMiddleware, progressRouter);
app.use("/api/sources", authMiddleware, sourcesRouter);
app.use("/api/books", authMiddleware, booksRouter);
app.use("/api", authMiddleware, aiRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const server = app.listen(port, host, () => {
  console.log(`Backend server listening on http://${host}:${port}`);
});
const keepAlive = setInterval(() => undefined, 60 * 60 * 1000);

process.on("SIGTERM", () => {
  clearInterval(keepAlive);
  server.close(() => process.exit(0));
});
