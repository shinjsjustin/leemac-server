// src/lib/ai/models.js
// Single source of truth for Anthropic model strings.

const ORCHESTRATOR = 'claude-sonnet-4-6';  // main chat / tool-use loop
const HEAVY        = 'claude-opus-4-7';    // PDF parse, consolidation
const FAST         = 'claude-haiku-4-5';   // email triage, lightweight tasks

module.exports = { ORCHESTRATOR, HEAVY, FAST };
