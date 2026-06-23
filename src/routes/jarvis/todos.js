// src/routes/jarvis/todos.js
// Jarvis to-do list — list, create, toggle done, and clear completed items.
// All routes are owner-only (enforced by the parent router via isAuth + access check).

const express = require('express');
const router = express.Router();
const db = require('../../db/db');

function toTodoRow(row) {
  return {
    id: row.id,
    title: row.content,
    description: row.description || null,
    content: row.content, // legacy alias — same value as title
    source: row.source,
    done: row.done === 1 || row.done === true,
    createdAt: row.created_at,
    doneAt: row.done_at,
  };
}

// ── POST /todos/clear ──────────────────────────────────────────────────────────
// MUST be registered before /:id to avoid Express matching 'clear' as an ID.
// Delete all completed to-dos.

router.post('/clear', async (req, res) => {
  try {
    const [result] = await db.execute(`DELETE FROM ai_todos WHERE done = 1`);

    return res.json({ cleared: result.affectedRows });
  } catch (err) {
    console.error('[todos] POST /clear error:', err);
    return res.status(500).json({ error: 'Failed to clear completed to-dos' });
  }
});

// ── GET /todos ─────────────────────────────────────────────────────────────────
// List all to-dos: incomplete first, then complete, each group newest-first.

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, content, description, source, done, created_at, done_at
       FROM ai_todos
       ORDER BY done ASC, created_at DESC`
    );

    return res.json(rows.map(toTodoRow));
  } catch (err) {
    console.error('[todos] GET / error:', err);
    return res.status(500).json({ error: 'Failed to fetch to-dos' });
  }
});

// ── POST /todos ────────────────────────────────────────────────────────────────
// Create a user-entered to-do. Body: { title, description? }
// `content` is accepted as a legacy alias for `title`.

router.post('/', async (req, res) => {
  const body = req.body || {};
  const rawTitle = body.title != null ? body.title : body.content;
  const rawDescription = body.description;

  if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const title = rawTitle.trim().slice(0, 500);
  const description =
    typeof rawDescription === 'string' && rawDescription.trim()
      ? rawDescription.trim()
      : null;

  try {
    const [result] = await db.execute(
      `INSERT INTO ai_todos (content, description, source) VALUES (?, ?, 'user')`,
      [title, description]
    );

    const [rows] = await db.execute(
      `SELECT id, content, description, source, done, created_at, done_at
       FROM ai_todos WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json(toTodoRow(rows[0]));
  } catch (err) {
    console.error('[todos] POST / error:', err);
    return res.status(500).json({ error: 'Failed to create to-do' });
  }
});

// ── PATCH /todos/:id ───────────────────────────────────────────────────────────
// Toggle done state on a single to-do.

router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT id, content, description, source, done, created_at, done_at FROM ai_todos WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'To-do not found' });
    }

    const todo = rows[0];
    const isCurrentlyDone = todo.done === 1 || todo.done === true;

    if (isCurrentlyDone) {
      await db.execute(
        `UPDATE ai_todos SET done = 0, done_at = NULL WHERE id = ?`,
        [id]
      );
    } else {
      await db.execute(
        `UPDATE ai_todos SET done = 1, done_at = NOW() WHERE id = ?`,
        [id]
      );
    }

    const [updated] = await db.execute(
      `SELECT id, content, description, source, done, created_at, done_at FROM ai_todos WHERE id = ?`,
      [id]
    );

    return res.json(toTodoRow(updated[0]));
  } catch (err) {
    console.error('[todos] PATCH /:id error:', err);
    return res.status(500).json({ error: 'Failed to toggle to-do' });
  }
});

module.exports = router;
