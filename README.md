# MAC-v1 Phase 1 Starter

This is the first runnable milestone for **Minecraft AI Companion**.

Implemented:

- Mineflayer bot connection
- GameState snapshot
- WebSocket command server
- `goto_position`
- `skill.cancel`
- `state.get`

Not implemented yet:

- LLM
- voice
- task graph
- memory
- collect/craft skills
- automatic recovery

## 1. Requirements

- Node.js 18+
- Minecraft Java Edition server

For the simplest local test, use an offline-mode local test server and configure:

```properties
online-mode=false
```

Do this only on a private/local test server.

## 2. Install

```bash
npm install
```

## 3. Environment

Copy `.env.example` to `.env`.

This starter intentionally does not depend on a dotenv package.
Set environment variables in your shell, or use the defaults in `src/config.ts`.

Defaults:

- Minecraft: `127.0.0.1:25565`
- Bot name: `MAC_Bot`
- Auth: `offline`
- WebSocket: `8765`

## 4. Run

```bash
npm run dev
```

Expected log:

```text
[MAC] starting...
[WS] listening on ws://127.0.0.1:8765
[BOT] connecting to 127.0.0.1:25565 as MAC_Bot
[BOT] spawned...
```

## 5. Test with browser DevTools

Open any browser page, then DevTools Console:

```js
const ws = new WebSocket("ws://127.0.0.1:8765");
ws.onmessage = e => console.log(JSON.parse(e.data));
```

Get state:

```js
ws.send(JSON.stringify({
  type: "state.get",
  requestId: "req-state-1"
}));
```

Move bot:

```js
ws.send(JSON.stringify({
  type: "skill.execute",
  requestId: "req-move-1",
  skill: "goto_position",
  params: {
    x: 10,
    y: 64,
    z: 10,
    radius: 1.5
  }
}));
```

Cancel:

```js
ws.send(JSON.stringify({
  type: "skill.cancel",
  requestId: "req-cancel-1"
}));
```

## 6. First acceptance test

1. Bot joins the server.
2. `state.get` returns the real bot coordinates/health/food/inventory.
3. Send `goto_position`.
4. Bot walks to the target.
5. Result is only `SUCCESS` after distance verification.
6. Send another long-distance `goto_position`, then `skill.cancel`.
7. Bot stops and returns `CANCELLED`.

Do not add LLM or voice until this chain is stable.
