# Nexus 2D Engine

Nexus is a browser-based 2D game editor built on Next.js, React, and Phaser, with an engine-aware AI assistant powered by Google Vertex AI.

## Highlights

- Editor workspace with launcher, recent projects, scene templates, prefab palette, inspector, autosave, import/export, and runtime simulation.
- Engine schema with scene settings, richer sprite/physics data, behavior components, script components, and runtime state serialization.
- Built-in behaviors for platformer player, top-down player, patrol enemies, collectibles, goals, hazards, and custom scripted entities.
- Deterministic hooks exposed through `window.render_game_to_text()` and `window.advanceTime(ms)` for automated inspection and testing.
- Server-side AI routes under `/api/*`, so Vertex credentials stay on the server.

## Run locally

1. Install dependencies:
   `npm install`
2. Ensure `.env.local` contains:
   `GOOGLE_GENAI_USE_VERTEXAI=true`
   `GOOGLE_CLOUD_PROJECT=<your-project>`
   `GOOGLE_CLOUD_LOCATION=<your-location>`
3. Provide runtime credentials for Vertex AI. The simplest local path is:

```bash
gcloud auth application-default login
```

4. Start the editor:

```bash
npm run dev
```

Then open `http://localhost:3000`.

Development and production builds now use separate Next output directories so switching between `dev` and `build/start` does not corrupt chunks.

## Production build

```bash
npm run build
npm run start
```

## AI workflow inside the engine

- `Create Full Game`: asks Vertex AI to generate a complete Nexus project JSON from scratch.
- `Edit Existing Game`: sends the current project JSON to Vertex AI so it can extend, repair, rebalance, or script the existing game.

The assistant is constrained to the engine schema:

- Components: `Transform`, `Sprite`, `RigidBody`, `Collider`, `Behavior`, `Script`
- Behaviors: `player-platformer`, `player-topdown`, `enemy-patrol`, `moving-platform`, `collectible`, `goal`, `hazard`
- Prefabs: `player`, `platform`, `enemy`, `collectible`, `goal`, `hazard`, `decoration`, `custom`

## Notes

- No client-side API key is exposed.
- If Vertex AI fails with an auth error, the API returns a message explaining that runtime credentials are missing.
- Projects autosave to local storage and can also be exported/imported as JSON.
