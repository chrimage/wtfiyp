# Phoenix Cartographer Solutions – Firebird “Intake POC” Contractor Brief

*Version: 2025‑06‑18*

---

## 1  Project Scope & Goal

Build a **browser‑based triage chat** that runs entirely on the Cloudflare stack.
When the AI determines (or is forced) that it has collected all key triage data, the Worker must **email**:

* a plain‑text **summary** (≤ 12 bullets)
* a **transcript.txt** attachment (full chat)

to **[alex@yourcompany.com](mailto:alex@yourcompany.com)**, with zero external services.

---

## 2  Solution at‑a‑glance

| Layer       | Service                                    | Purpose                                              |
| ----------- | ------------------------------------------ | ---------------------------------------------------- |
| Static site | **Cloudflare Pages**                       | `index.html`, `chat.js`                              |
| API runtime | **Cloudflare Worker**                      | `/chat` → AI reply  •  `/submit` → summarise + email |
| AI          | **Workers AI – @cf/google/gemma‑3‑12b‑it** | Generates Firebird replies & summary                 |
| State       | **Durable Object**                         | Holds transcript, status, alarm timer                |
| Email       | **Email Routing** (`send_email` binding)   | Sends message + attachment                           |
| MIME lib    | **mimetext**                               | Builds RFC‑822 email with attachment                 |

---

## 3  Repository Layout

```
phoenix-intake/
├─ frontend/
│  ├─ index.html       # simple chat UI
│  └─ chat.js          # widget logic
├─ worker/
│  ├─ src/triage.ts    # Worker & DO
│  └─ wrangler.toml
└─ README.md
```

---

## 4  Conversation → Email Control Loop

### 4.1 Required Data Fields (“completion bar”)

```
problem, domain(s), urgency, obstacles/failed attempts, contact
```

### 4.2 Stop‑Signals

1. **AI token** – add to system prompt:
   *When all five fields captured, end with* `[[FIREBIRD_DONE]]`.
2. **Finish button** – visible after first reply; POST `/submit`.
3. **Page exit beacon** – `pagehide` + `visibilitychange`:
   `navigator.sendBeacon('/submit', body)`.
4. **Idle alarm** – Durable Object sets `alarm()` 2 min after last activity; on fire, auto‑submit partial transcript.
5. **Turn cap** – if ≥ 10 user messages and not complete, force `[[FIREBIRD_DONE]]`.

### 4.3 Idempotent Email Guard

`state.storage.get('emailed')` check inside `submitAndEmail()` before send.

---

## 5  Cloudflare Configuration

### wrangler.toml skeleton

```toml
name = "phoenix-intake"
main = "worker/src/triage.ts"
compatibility_date = "2025-06-18"
nodejs_compat = true

ai          = [{ binding = "AI" }]
send_email  = [{ name = "NOTIFY", destination_address = "alex@yourcompany.com" }]
```

### Email Routing Steps

1. Enable **Email Routing**.
2. Add & verify `alex@yourcompany.com` as **Destination**.
3. SPF/DKIM TXT records per dashboard.

---

## 6  Key Code Responsibilities

### 6.1 Worker (`/chat` & `/submit`)

* Enforce stop‑signal logic.
* Interface with Workers AI (temp 0.3, max\_tokens 300).
* Store + retrieve conversation in Durable Object.
* Summarise with secondary AI call (temp 0.2, max\_tokens 256).
* Build MIME email (mimetext) + `transcript.txt` (≤ 20 KB).
* Send via `env.NOTIFY.send()`.

### 6.2 Front‑end (`chat.js`)

* Maintain `transcript` array.
* Handle Finish button.
* Implement `sendBeacon` on unload.
* Render messages; scroll to bottom.

---

## 7  Testing Checklist

| Test                      | Expected                                |
| ------------------------- | --------------------------------------- |
| Local `wrangler dev` chat | AI replies ≤ 2 s                        |
| Click Finish              | Email arrives with summary + attachment |
| Close tab mid‑chat        | Email still arrives (idle beacon)       |
| No activity 2 min         | DO alarm triggers email                 |
| Repeat `/submit`          | Second email suppressed (idempotent)    |

---

## 8  Deliverables

1. **Git repo** per structure above.
2. **README** – setup, deploy, model swap.
3. **Worker & Pages projects** in CF dashboard.
4. **Demo video** of happy‑path & early‑exit path.
5. **Post‑deployment notes** – add recipients, adjust idle timer.

---

## 9  Timeline & Milestones

| Day  | Milestone                          |
| ---- | ---------------------------------- |
|  0‑1 | Repo scaffold, wrangler dev echo   |
|  2‑3 | AI reply + UI integrated           |
|  4   | Email send w/ summary & attachment |
|  5   | Stop‑signal logic complete         |
|  6   | Edge deploy & demo                 |

---

## 10  Acceptance Criteria

* AI responds within 2 s median.
* Email contains ≤ 12 bullet summary and `transcript.txt`.
* Leads cannot be lost (any stop‑signal path works).
* Code passes ESLint + `wrangler deploy`.
* No outbound email to unverified addresses.

---

### ☑️ Sign‑off

Submit PR + demo link for final approval by Captain Harley Miller.

