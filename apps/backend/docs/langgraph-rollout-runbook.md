# LangGraph Rollout Runbook (SNL-54)

## Purpose
This runbook defines how to enable LangGraph transition telemetry and shadow rollout safely before production cutover.

## Feature Flags
- `AI_SALES_LANGGRAPH_ENABLED`: global master switch (`true|false`).
- `AI_SALES_LANGGRAPH_SHADOW_MODE`: keeps legacy replies while emitting LangGraph routing telemetry (`true` recommended for phase 1).
- `AI_SALES_LANGGRAPH_ROLLOUT_PERCENT`: percentage bucket (`0-100`) for deterministic conversation rollout.
- `AI_SALES_LANGGRAPH_CHANNELS`: optional comma-separated channels (`whatsapp,webchat`). Defaults to both.
- `AI_SALES_LANGGRAPH_CONVERSATION_ALLOWLIST`: optional comma-separated conversation IDs to force inclusion regardless of percentage.

## Telemetry Contract
When enabled, backend logs emit:

- `sales_graph_transition`
  - fields: `conversationId`, `traceId`, `fromNode`, `toNode`, `status`, `latencyMs`, `mode`, `replayed`, `tool`, `errorCode`
  - `mode`: `shadow` or `live`
  - `status`: `success`, `retry`, `fallback`, `error`

## Shadow Rollout Procedure (Phase 1)
1. Set `AI_SALES_LANGGRAPH_ENABLED=true`.
2. Set `AI_SALES_LANGGRAPH_SHADOW_MODE=true`.
3. Start with `AI_SALES_LANGGRAPH_ROLLOUT_PERCENT=5`.
4. Keep `AI_SALES_LANGGRAPH_CHANNELS=whatsapp` until telemetry is stable.
5. Verify events in logs for at least 24h.
6. Increase percentage gradually (`5 -> 15 -> 30 -> 50`).

## Verification Checklist
- [ ] Inbound customer messages still receive legacy reply plans.
- [ ] `sales_graph_transition` logs are present for rolled conversations.
- [ ] `traceId` format includes conversation and inbound message correlation.
- [ ] `status=fallback` appears while shadow mode is enabled.
- [ ] No increase in `conversation_flow_fallback_triggered` logs.
- [ ] No queue regression in `ai_sales_job_failed` / `ai_sales_job_completed` ratio.
- [ ] At least one allowlisted conversation emits transition logs with rollout percent set to `0`.

## Rollback
1. Set `AI_SALES_LANGGRAPH_ENABLED=false`.
2. Redeploy backend.
3. Confirm `sales_graph_transition` events stop.
4. Keep checkpoints as historical data; no schema rollback required.
