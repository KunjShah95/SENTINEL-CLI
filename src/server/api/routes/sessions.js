/**
 * Sessions route — CRUD for chat sessions.
 *
 * Mirrors packages/server/src/routes/sessions.ts from Nightcode with
 * the additions needed for Sentinel's security platform
 * (projectPath, mode/model defaulting, status field).
 *
 * Input validation uses the Zod middleware from validate.js.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validate, createSessionSchema } from '../middleware/validate.js';
import { createSession, getSession, listSessions, deleteSession } from '../../database/sessions.js';

const sessions = new Hono();

sessions.get('/', async c => {
  const userId = c.get('userId');
  const list = await listSessions({ userId });
  return c.json(list);
});

sessions.get('/:id',
  validate({
    params: z.object({ id: z.string().min(1) }),
  }),
  async c => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const session = await getSession({ id, userId });
    if (!session) return c.json({ error: 'Session not found' }, 404);
    return c.json(session);
  }
);

sessions.post('/',
  validate({ body: createSessionSchema }),
  async c => {
    const userId = c.get('userId');
    const { title, mode, model, projectPath } = c.get('validatedBody');
    const session = await createSession({
      userId,
      title,
      mode,
      model,
      projectPath,
    });
    return c.json(session, 201);
  }
);

sessions.delete('/:id',
  validate({
    params: z.object({ id: z.string().min(1) }),
  }),
  async c => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const ok = await deleteSession({ id, userId });
    if (!ok) return c.json({ error: 'Session not found' }, 404);
    return c.json({ ok: true });
  }
);

export default sessions;
