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
const { requireAdmin } = require('../../middleware/requireRole');

// All Jarvis routes require a level-3 admin token.
// isAuth is applied upstream in app.js; this adds the role and level check.
router.use(requireAdmin(3));

router.use('/', chatRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/todos', todosRoutes);
router.use('/google', googleRoutes);

module.exports = router;
