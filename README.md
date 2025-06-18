# WTFIYP 🔥

**What The Fuck Is Your Problem?**

A brutally efficient triage chat that cuts through the bullshit and gets straight to the point. No hand-holding, no corporate speak, just raw problem-solving efficiency powered by AI.

## What This Does

You got a problem? This chat will extract the essential details from you faster than you can say "have you tried turning it off and on again." It's designed for people who are already pissed off and don't want to waste time explaining their life story to a chatbot.

**Key Features:**
- 🎯 **No-bullshit AI** that gets straight to the point
- ⚡ **Lightning fast** - built on Cloudflare's edge network
- 📧 **Auto-emails** a concise summary to support when done
- 🛡️ **Bulletproof** - handles rage-quits, timeouts, and everything in between
- 💀 **Zero external dependencies** - pure Cloudflare stack

## How It Works

1. **You vent** - Tell the AI what's fucked up
2. **It extracts** - Gets the details that actually matter
3. **It summarizes** - Creates a readable report for humans
4. **It delivers** - Emails the summary to support staff

The chat ends when either:
- The AI has enough info to help you
- You click "Fuck it, I'm done"
- You rage-quit (closes the tab)
- You go silent for 2 minutes
- You hit the message limit (we're not writing novels here)

## What Gets Collected

The AI focuses on extracting these key details:
- **The Problem** - What's actually broken
- **The Domain** - What system/service is affected
- **Urgency Level** - How critical this shit is
- **Failed Attempts** - What you've already tried
- **Contact Info** - How to reach you

## Quick Start

### Prerequisites
- Cloudflare account with Workers enabled
- Node.js 18+ and npm
- A domain configured with Cloudflare (for email routing)
- Basic tolerance for profanity

### Setup
```bash
git clone <this-repo>
cd wtfiyp
cd worker && npm install
```

### Configure Email
1. Enable Email Routing in Cloudflare dashboard
2. Add your support email as destination
3. Verify the email address
4. Update `wrangler.toml` with your email

### Deploy
```bash
npx wrangler deploy
```

### Test Locally
```bash
npx wrangler dev
# Visit http://localhost:8787
```

## Configuration

### Change the Email Recipient
Edit `worker/wrangler.toml`:
```toml
[[send_email]]
name = "NOTIFY"
destination_address = "your-support@company.com"
```

### Adjust the Attitude
Modify the AI system prompt in `worker/src/triage.ts` around line 274. Make it more or less aggressive as needed.

### Change the Timeout
Default is 2 minutes of inactivity. Adjust in the `setAlarm()` method:
```typescript
const alarmTime = Date.now() + 5 * 60 * 1000; // 5 minutes
```

## Project Structure

```
wtfiyp/
├── frontend/           # Static chat interface
│   ├── index.html     # Chat UI
│   └── chat.js        # Client-side logic
├── worker/            # Cloudflare Worker
│   ├── src/triage.ts  # Main Worker + Durable Object
│   ├── wrangler.toml  # Cloudflare config
│   └── package.json   # Dependencies
└── README.md          # This file
```

## Why This Exists

Because most support chat systems are designed by people who have never actually needed support. They're slow, they ask irrelevant questions, and they make you repeat yourself five times.

This system assumes you're already frustrated and just want to get your problem solved. It collects the essential information quickly and gets it to someone who can actually help.

## Technical Details

- **Runtime**: Cloudflare Workers (Edge computing)
- **State Management**: Durable Objects (Global consistency)
- **AI Model**: Gemma-3-12b-it (Fast and efficient)
- **Email**: Cloudflare Email Routing (No external SMTP)
- **Storage**: Durable Object storage (Automatic persistence)

## Limitations

- **Email sending limits** - Cloudflare has rate limits
- **AI costs** - Monitor usage in the dashboard
- **Data retention** - Transcripts are stored temporarily
- **Language** - Contains profanity (obviously)

## Contributing

Found a bug? Have a suggestion? Open an issue or submit a PR. Just keep the same energy - direct, practical, and no-nonsense.

## License

MIT License - Use it, break it, fix it, whatever. Just don't blame us if it hurts someone's feelings.

---

**Built for people who have real problems and need real solutions.**