# Conversation Control Runbook (CRM)

## Purpose
This runbook explains how operators transfer a WhatsApp conversation to a human, return it to AI, and diagnose cases where AI does not resume.

## Control Modes
- `ai_control`: AI owns the thread and continues automated qualification.
- `human_control`: CRM owner has taken over and AI replies are paused.
- `pending_resume`: Owner requested return to AI; AI resumes on the next inbound customer message.

## Normal Operating Flow
1. Open the conversation in CRM Inbox.
2. Click `Pasar a humano` when a salesperson should take over.
3. Send manual replies from CRM while in `human_control`.
4. Click `Devolver a IA` when ready to return automation.
5. Wait for the customer's next inbound message; the bot resumes and state returns to `ai_control`.

## Backend Telemetry Events
Track these structured events in backend logs:

- `conversation_control_transferred`
  - emitted when CRM transfers to `human_control`
  - fields: `conversationId`, `actor`, `control`, `state`

- `conversation_control_resumed_ai`
  - emitted when CRM sets control to `pending_resume`
  - fields: `conversationId`, `actor`, `control`, `state`

- `conversation_control_resume_failed`
  - emitted when resume is requested from an invalid state
  - fields: `conversationId`, `actor`, `reason`, `currentState`

## Quick Triage: AI Did Not Resume
1. Verify the UI status chip is `Ready to resume AI` (`pending_resume`).
2. Confirm a new inbound customer message arrived after the resume request.
3. Check backend logs for the conversation ID:
   - Expect `conversation_control_resumed_ai` first.
   - If missing, the resume action never completed.
   - If `conversation_control_resume_failed` exists, the action was invalid; transfer to human first, then retry.
4. Confirm bot state transitions out of `HUMAN_HANDOFF` to `QUALIFYING` on next inbound.
5. If still stuck, capture `conversationId`, timestamps, and recent control events for engineering.

## Known Guardrails
- Returning control to AI is only valid from `HUMAN_HANDOFF`.
- Resume does not force an immediate outbound. AI waits for the next inbound message to avoid unsolicited responses.
