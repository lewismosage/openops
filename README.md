# OpenOps

A lightweight developer operations console to monitor multiple servers and **notify you when something goes wrong**.

## What it does today (MVP)

- Register all your servers in one dashboard
- Run health checks (HTTP, TCP, ping)
- Install a small agent on each server for CPU/RAM/disk metrics
- Get alerts via **Discord**, **Telegram**, **email**, or **webhook**
- Track incidents (down → recovered)

## Should you clone an existing tool?

| Tool | Best for | Clone it? |
|------|----------|-----------|
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | Uptime + 90+ notification channels | Use as-is if you only need uptime |
| [Beszel](https://github.com/henrygd/beszel) | Server metrics + Docker stats | Use as-is if you only need metrics |
| **OpenOps (this)** | Unified dashboard + alerts + room to grow (logs, AI) | Build & extend |

**Recommendation:** Don't fork Uptime Kuma or Beszel unless you want to maintain their full codebase. Use OpenOps as your custom layer, or run Uptime Kuma alongside it for battle-tested uptime checks.

## Quick start (local)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### 3. Add a server

1. Add server in the dashboard
2. Copy the **agent token**
3. On the server, run:

```bash
pip install -r agent/requirements.txt
python agent/agent.py --hub http://YOUR_HUB_IP:8000 --token YOUR_TOKEN
```

### 4. Add health checks (API)

```bash
# HTTP check
curl -X POST http://localhost:8000/api/servers/1/checks \
  -H "Content-Type: application/json" \
  -d '{"name":"API health","check_type":"http","target":"https://api.example.com/health"}'

# TCP check
curl -X POST http://localhost:8000/api/servers/1/checks \
  -H "Content-Type: application/json" \
  -d '{"name":"Postgres","check_type":"tcp","target":"db.example.com:5432"}'

# Ping check
curl -X POST http://localhost:8000/api/servers/1/checks \
  -H "Content-Type: application/json" \
  -d '{"name":"Ping","check_type":"ping","target":"8.8.8.8"}'
```

### 5. Discord notifications

In the dashboard, paste your Discord webhook URL. You'll get alerts like:

```
[DOWN] Ubuntu-03 (production)
Server `Ubuntu-03` is now down.
Host: 10.0.0.5
Check: API health
Error: Connection refused
```

## Docker

```bash
docker compose up --build
```

- Dashboard: http://localhost:3000
- API: http://localhost:8000

## Roadmap (next phases)

1. **Logs** — ship logs with Grafana Loki or a lightweight log collector
2. **SSH actions** — restart services, run commands from the dashboard
3. **AI diagnosis** — correlate metrics + logs and suggest fixes
4. **Deployments** — track last deploy per server
5. **Multi-user auth** — team access with roles

## Architecture

```
┌─────────────┐     heartbeat      ┌──────────────┐
│ OpenOps     │ ◄───────────────── │ Agent        │
│ Agent       │                    │ (each server)│
└─────────────┘                    └──────────────┘
       │
       ▼
┌──────────────┐   health checks   ┌──────────────┐
│ OpenOps Hub  │ ────────────────► │ Your servers │
│ (FastAPI)    │                   │ HTTP/TCP/ping│
└──────────────┘                   └──────────────┘
       │
       ├──► SQLite/Postgres (servers, incidents)
       ├──► Scheduler (every 30s)
       └──► Discord / Telegram / Email / Webhook
```

## API docs

Once running: http://localhost:8000/docs
