import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {attachVertexAiMiddleware} from './server/vertex-ai-middleware';

function vertexAiApiPlugin(): Plugin {
  return {
    name: 'vertex-ai-api',
    configureServer(server) {
      attachVertexAiMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachVertexAiMiddleware(server.middlewares);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('GOOGLE_') || key.startsWith('GCP_') || key === 'APP_URL') {
      process.env[key] = value;
    }
  }

  return {
    plugins: [react(), tailwindcss(), vertexAiApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    preview: {
      port: 3000,
    },
  };
});
