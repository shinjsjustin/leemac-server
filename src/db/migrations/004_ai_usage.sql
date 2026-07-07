-- src/db/migrations/004_ai_usage.sql
-- Adds a token-usage ledger so Jarvis' Anthropic spend is visible per day,
-- per model, and per purpose (chat vs PDF extraction vs triage vs verification).
--
-- Every Anthropic response carries a `usage` object; this table captures one row
-- per model call. Writes are best-effort (fire-and-forget) — a failure here must
-- never break a model call, same philosophy as the ai_tool_log audit trail.
--
-- Run against the existing LeeMac database after 003_todo_title_description.sql.

CREATE TABLE IF NOT EXISTS ai_usage (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  session_id    INT NULL,
  model         VARCHAR(64)  NOT NULL,
  purpose       VARCHAR(64)  NOT NULL,   -- 'orchestrator','pdf_extract','email_triage','rfq_triage','consolidation','bezalel','moses',...
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_usage_created (created_at),
  KEY idx_ai_usage_purpose (purpose)
);
