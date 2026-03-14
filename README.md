# Nexus 2D Engine

Nexus is now a browser-based 2D game editor built on React + Phaser with an engine-aware AI assistant wired through Google Vertex AI.

## What changed

- Reworked the editor into a proper engine workspace with scene templates, prefab palette, runtime preview, inspector, export/import, local autosave and mobile viewport preview.
- Expanded the engine schema with scene settings, richer sprite/physics data, behavior components and runtime state serialization.
- Added engine-side behaviors for platformer player, top-down player, patrol enemies, collectibles, goals and hazards.
- Exposed `window.render_game_to_text()` and `window.advanceTime(ms)` for deterministic external inspection/control.
- Added a server-side Vertex AI middleware under `/api/ai/generate-project` so secrets stay off the client.
- The AI assistant now operates as an in-engine smart developer: it can create full games, extend an existing project, fix gameplay structure and emit Script components when custom logic is needed.

## Run locally

1. Install dependencies:
   `npm install`
2. Ensure `.env.local` contains:
   `GOOGLE_GENAI_USE_VERTEXAI=true`
   `GOOGLE_CLOUD_PROJECT=<your-project>`
   `GOOGLE_CLOUD_LOCATION=<your-location>`
3. Provide runtime credentials for Vertex AI.

For local development, the simplest path is Application Default Credentials:

```bash
gcloud auth application-default login
```

Then run:

```bash
npm run dev
```

The Vite dev server also hosts the Vertex AI middleware, so the editor and `/api/*` run from the same origin.

## AI workflow inside the engine

- `Create Full Game`: asks Vertex AI to generate a complete Nexus project JSON from scratch.
- `Edit Existing Game`: sends the current project JSON to Vertex AI so it can add systems, repair gameplay, rebalance levels, or write engine scripts for custom functionality.

The assistant is constrained to the engine schema:

- Components: `Transform`, `Sprite`, `RigidBody`, `Collider`, `Behavior`, `Script`
- Behaviors: `player-platformer`, `player-topdown`, `enemy-patrol`, `moving-platform`, `collectible`, `goal`, `hazard`
- Prefabs: `player`, `platform`, `enemy`, `collectible`, `goal`, `hazard`, `decoration`, `custom`

## Notes

- No client-side API key is exposed.
- If Vertex AI fails with an auth error, the middleware returns a message explaining that runtime credentials are missing.
- The project autosaves to local storage and can also be exported/imported as JSON.
