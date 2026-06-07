/**
 * Sessions route — CRUD for chat sessions.
 *
 * Mirrors packages/server/src/routes/sessions.ts from Nightcode with
 * the additions needed for Sentinel's security platform
 * (projectPath, mode/model defaulting, status field).
 */

import { Hono } from "hono";
import { z } from "../../../shared/schemas/index.js";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
} from "../../database/sessions.js";

const sessions = new Hono();

const createSchema = z.object({
  title: z.string().min(1, "title is required"),
  mode: z.enum(["BUILD", "PLAN", "REVIEW"]).optional(),
  model: z.string().optional(),
  projectPath: z.string().optional(),
});

sessions.get("/", async (c) => {
  const userId = c.get("userId");
  const list = await listSessions({ userId });
  return c.json(list);
});

sessions.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const session = await getSession({ id, userId });
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

sessions.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error?.message || "Invalid request" }, 400);
  }
  const { title, mode, model, projectPath } = parsed.data;
  const session = await createSession({
    userId,
    title,
    mode,
    model,
    projectPath,
  });
  return c.json(session, 201);
});

sessions.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const ok = await deleteSession({ id, userId });
  if (!ok) return c.json({ error: "Session not found" }, 404);
  return c.json({ ok: true });
});

export default sessions;
