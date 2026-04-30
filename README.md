# WhatsApp Mate — Local MVP

Visual no-code WhatsApp bot builder. Single-user, local development only.

## Stack
- **Backend:** FastAPI + MongoDB + Redis Streams + RabbitMQ + Chroma
- **Frontend:** Next.js + React Flow + Tailwind
- **LLM:** BYOK (Gemini / OpenAI / Anthropic)
- **Channel:** WhatsApp Cloud API (via ngrok for local)

## Quick Start

### 1. Infrastructure
```powershell
docker-compose up -d
```

### 2. Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env

# Terminal A: API
uvicorn app.main:app --reload --port 8000

# Terminal B: Worker
python worker.py
```

### 3. Frontend
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

### 4. Expose Webhook
```powershell
ngrok http 8000
```
Copy the HTTPS URL.

## Connect a WhatsApp Number
1. Create a Meta App → enable WhatsApp product
2. In the app, create a bot → go to **Settings** tab
3. Paste **Phone Number ID** + **Access Token** (test token works) + **Verify Token** (defaults to your bot ID)
4. Configure LLM provider/model/API key
5. In Meta App webhook config:
   - Callback URL: `https://<ngrok>.ngrok-free.app/webhook/<bot_id>`
   - Verify token: same as in Settings
   - Subscribe to `messages` field
6. Build your flow in the **Builder** tab → drag nodes → connect → Save & Publish
7. Send a WhatsApp message to your test number → see live updates in **Threads**

## Node Types
| Node | Purpose |
|---|---|
| Initialize | Always first; credentials live in Settings |
| Message | Send text + optional buttons |
| Question | Send prompt, capture reply into a variable |
| Condition | Branch on variable (equals/contains/regex/gt/lt/exists) |
| Loop | Repeat body N times |
| Wait | Pause N seconds |
| Code | Sandboxed Python (RestrictedPython); read/write `vars` |
| API Call | HTTP request, save response to a variable |
| LLM Agent | Call configured LLM with prompt + history |
| KB Query | RAG over uploaded PDFs |
| Handover | Mark thread for human; pause bot |
| End | Terminate flow |

Variables are interpolated with `{{variable_name}}` in any text/url/prompt field.
`{{last_user_input}}` is auto-set to the latest message text.

## Knowledge Base
- Upload PDFs in the **Knowledge Base** tab
- Worker chunks → embeds with `all-MiniLM-L6-v2` → stores in Chroma per bot
- KB Query node performs vector search and stores top-k chunks into a variable
