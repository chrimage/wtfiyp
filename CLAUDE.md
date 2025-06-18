# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WTFIYP (What The Fuck Is Your Problem) is a browser-based triage chat system that collects user issue information, summarizes it with AI, and emails results to support staff. It's built entirely on the Cloudflare stack.

## Core Architecture

- **Worker** (`worker/src/triage.ts`): Main Cloudflare Worker handling chat API and email sending
- **Durable Object** (`TriageState` class): Manages conversation state, transcripts, and idle timeouts
- **Frontend** (`frontend/`): Static HTML/JS chat interface (also served inline from Worker)
- **AI Integration**: Uses `@cf/google/gemma-3-12b-it` for chat responses and summarization
- **Email**: Cloudflare Email Routing with MIME message generation via `mimetext` library

## Development Commands

### Primary Development
```bash
cd worker
npm install          # Install dependencies
npm run dev          # Start local development server (wrangler dev)
npm run deploy       # Deploy to Cloudflare
npm run type-check   # TypeScript type checking
npm run test         # Run tests with Vitest
```

### Local Testing
```bash
npx wrangler dev     # Local dev server at http://localhost:8787
npx wrangler tail    # View live logs
```

## Key Workflows

### Chat Flow
1. User messages hit `/chat` endpoint with sessionId, message, messageCount
2. Worker gets/creates Durable Object for session state
3. AI generates response using conversation history
4. Response checked for termination signals (`[[FIREBIRD_DONE]]` or 10+ messages)
5. Transcript updated in Durable Object with 2-minute idle alarm

### Termination & Email
The system ends chat and sends email via multiple triggers:
- AI adds `[[FIREBIRD_DONE]]` token when enough info collected
- User clicks "Finish & Submit" button
- Page close/unload (beacon API)
- 2-minute idle timeout (Durable Object alarm)
- 10+ user messages (turn limit)

### Email Generation
- AI summarizes conversation into ≤12 bullet points
- Full transcript formatted as timestamped text
- MIME email created with `mimetext` and sent via Cloudflare Email Routing
- Idempotent submission prevents duplicate emails

## Configuration

### Email Recipients
Update `wrangler.toml` send_email binding:
```toml
[[send_email]]
name = "NOTIFY"
destination_address = "your-email@company.com"
```

### AI Model Changes
Modify AI calls in `triage.ts`:
```typescript
await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  // ... parameters
});
```

### Timeout Adjustments
Change idle timer in `setAlarm()` method:
```typescript
const alarmTime = Date.now() + 5 * 60 * 1000; // 5 minutes instead of 2
```

## Data Collection Fields

The AI extracts 5 critical details for support follow-up:
- **Problem**: What exactly is broken/not working
- **Domain**: Which system/service/platform is affected
- **Urgency**: Impact level and timeline constraints
- **Obstacles**: What troubleshooting steps were already tried
- **Contact**: Name and email/phone number for support to follow up

The system collects essential contact information so support staff can reach the person who reported the issue.

## Testing Approach

No specific test framework configured. Manual testing checklist:
- Chat responses under 2 seconds locally
- Finish button triggers email with summary
- Page close sends beacon email
- 2-minute idle timeout works
- Duplicate submissions prevented

Load test the chat endpoint:
```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","message":"My website is down","messageCount":1}'
```

## Deployment Requirements

1. Cloudflare account with Workers enabled
2. Email Routing configured with verified destination address
3. Domain configured with Cloudflare (for email routing)
4. SPF/DKIM DNS records per Cloudflare dashboard instructions

The system uses a single Cloudflare Worker that serves both the API endpoints and static frontend files inline (no separate static hosting required).