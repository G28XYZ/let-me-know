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

// Routes
app.use("/api/health", healthRouter);
app.use("/api/gemini", geminiRouter);
app.use("/api", aiRouter);

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
