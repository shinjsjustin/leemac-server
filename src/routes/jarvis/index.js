// src/routes/jarvis/index.js
// Barrel router for all Jarvis API routes.
// Mount at /api/jarvis in server.js (with isAuth middleware applied there).
//
// Sub-routers:
//   chatRoutes      — session, chat, lifecycle, SSE, uploads  (chat.js)
//   approvalsRoutes — ai_approvals CRUD                       (approvals.js)
//   todosRoutes     — ai_todos CRUD                           (todos.js)
//   googleRoutes    — Google integrations                     (google.js)

const express = require('express');
const router = express.Router();
const chatRoutes = require('./chat');
const approvalsRoutes = require('./approvals');
const todosRoutes = require('./todos');
const googleRoutes = require('./google');

// All Jarvis routes require owner-level access (access >= 3).
// isAuth is applied upstream in server.js; this adds the access-level check.
router.use((req, res, next) => {
  if (!req.user || req.user.access < 3) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
});

router.use('/', chatRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/todos', todosRoutes);
router.use('/google', googleRoutes);

module.exports = router;
