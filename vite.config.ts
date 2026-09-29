import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

const DEFAULT_PERMANENT_CONFIG = {
  sheetUrl: 'https://script.google.com/macros/s/AKfycbwovq3KZIAmxYWJPNMBR9tpeehMXIzUntTD6y0a9dhQsPQ2btXqDPTyzmSmOfvJzQbcIQ/exec',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbwovq3KZIAmxYWJPNMBR9tpeehMXIzUntTD6y0a9dhQsPQ2btXqDPTyzmSmOfvJzQbcIQ/exec',
  spreadsheetId: '1D4EG0_4QODvwWMk-6AKcUu6HijW5ZBzfrTLXpjA2okk',
  isLocked: true,
  password: 'admin',
  liveSyncEnabled: true,
  lastSyncedAt: '',
  lastSyncStatus: 'success',
  lastSyncMessage: 'Connected to Google Sheet Backend'
};

let inMemoryConfig: any = DEFAULT_PERMANENT_CONFIG;

function setupSheetMiddleware(server: any) {
  server.middlewares.use('/api/sheet-config', (req: any, res: any) => {
    const configPath = path.resolve(__dirname, 'src/data/permanentSheetConfig.json');
    const publicPath = path.resolve(__dirname, 'public/sheet_config.json');
    const storePath = path.resolve(__dirname, 'sheet_config_store.json');

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          inMemoryConfig = data;
          try {
            fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
          } catch (e) {}
          try {
            fs.writeFileSync(publicPath, JSON.stringify(data, null, 2), 'utf-8');
          } catch (e) {}
          try {
            fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
          } catch (e) {}
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, config: data }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err?.message || 'Error saving' }));
        }
      });
    } else {
      try {
        if (inMemoryConfig && inMemoryConfig.sheetUrl) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(inMemoryConfig));
          return;
        }
        for (const p of [configPath, publicPath, storePath]) {
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.sheetUrl || parsed.spreadsheetId)) {
              inMemoryConfig = parsed;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
              return;
            }
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(DEFAULT_PERMANENT_CONFIG));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err?.message || 'Error reading' }));
      }
    }
  });

  server.middlewares.use('/api/sync-sheet', (req: any, res: any) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const targetUrl = payload.url;
          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: 'Missing target URL' }));
            return;
          }
          const resp = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload.data || payload),
          });
          const text = await resp.text();
          res.setHeader('Content-Type', 'application/json');
          res.end(text || JSON.stringify({ success: true }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: err?.message || 'Proxy error' }));
        }
      });
    } else {
      res.statusCode = 405;
      res.end('Method Not Allowed');
    }
  });
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'sheet-config-endpoint',
        configureServer(server: any) {
          setupSheetMiddleware(server);
        },
        configurePreview(server: any) {
          setupSheetMiddleware(server);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
