import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { healthRouter } from "./routes/health";
import { geminiRouter } from "./routes/gemini";
import { aiRouter } from "./routes/ai";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increase limit for large text files/PDFs

// Simple Auth
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  const expectedPassword = process.env.AUTH_PASSWORD;
  
  if (!expectedPassword || password === expectedPassword) {
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
  if (authHeader && authHeader === `Bearer ${expectedPassword}`) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Routes
app.use("/api/health", authMiddleware, healthRouter);
app.use("/api/gemini", authMiddleware, geminiRouter);
app.use("/api", authMiddleware, aiRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(port, host, () => {
  console.log(`Backend server listening on http://${host}:${port}`);
});
