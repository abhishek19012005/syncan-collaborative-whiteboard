# SYNCAN v11 — Interview Edition

A real-time collaborative whiteboard built with React, TypeScript, HTML5 Canvas, Node.js and WebSockets.

## v11 UI upgrade

- Premium authentication experience with animated collaborative preview.
- Animated room lobby with Create Room and Join Room flows.
- Premium workspace with compact navigation rail, live collaboration banner and participant panel.
- Animated presence avatars and remote cursors.
- Room identity and one-click sharing remain prominent.
- Keyboard shortcut modal: P, E, Ctrl/Cmd+Z, Ctrl/Cmd+Y and ?.
- Reduced-motion accessibility support.
- Empty-canvas onboarding state and live sync metrics.
- No Google sign-in and no third-party branding/watermarks.
- Existing real-time drawing, stroke batching, cursor throttling and authenticated sessions are preserved.

## Run

### Server
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

## Interview focus

The interface intentionally surfaces the engineering story: authenticated sessions, room identity, real-time presence, live cursors, batched stroke streaming, performance-conscious updates and keyboard-first interaction.

## Next engineering priorities

1. Persistent database-backed rooms
2. Per-user collaborative undo/redo
3. Reconnection and state recovery
4. Shape/text/sticky-note objects
5. Export to PNG/PDF
6. Automated unit/integration tests
7. Production deployment and observability


## Branding
The project is branded as **SYNCAN**. The logo is an abstract S-shaped drawing gesture with motion trails, representing synchronized creation on a shared canvas.


## R&D upgrade checklist

- **Real-time drawing:** WebSocket stroke streaming with live cursor updates.
- **Collaborative undo/redo:** undo/redo targets the requesting user's own latest stroke and broadcasts the change to every connected client.
- **Persistence:** users and room canvases are stored in `server/data/*.json` and survive server restarts.
- **Reconnection/state recovery:** the client reconnects with exponential backoff; every successful room join receives a fresh `ROOM_STATE`, and `SYNC_REQUEST` is available for explicit recovery.
- **Export:** PNG download plus browser print flow for **Save as PDF**.
- **Tests:** `npm test` in `server` covers room ID normalization and per-user undo targeting.
- **Deployment:** `render.yaml` contains a server + static-client deployment blueprint.
- **GitHub:** initialize Git, push the project, and use the deployment blueprint from the repository.

### Production deployment

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and select the repository.
3. Render reads `render.yaml`, builds the Node/WebSocket server and the Vite static client.
4. Confirm the generated service URLs match the values in `render.yaml`; if your Render account changes the names, update `VITE_API_URL`, `VITE_WS_URL`, and `CLIENT_ORIGIN`.
5. Set a strong `SESSION_SECRET` in production.

### GitHub commands

```bash
git init
git add .
git commit -m "feat: production-ready collaborative whiteboard"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```
# SYNCAN — Real-Time Collaborative Whiteboard

Live Demo:
https://syncan.onrender.com

Backend:
https://syncan-server.onrender.com

GitHub:
https://github.com/abhishek19012005/syncan-collaborative-whiteboard
