import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Mock Heart Rate Data Generation
  let currentHeartRate = 72;
  setInterval(() => {
    // Random fluctuation between -2 and +2
    const change = Math.floor(Math.random() * 5) - 2;
    currentHeartRate = Math.max(60, Math.min(180, currentHeartRate + change));
    
    io.emit('heartRate', {
      value: currentHeartRate,
      timestamp: Date.now(),
      status: currentHeartRate > 140 ? 'high' : currentHeartRate < 65 ? 'low' : 'normal'
    });
  }, 1000);

  // API Routes
  app.get('/api/health', (req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', message: 'AetherAegis Biometric Link Active' });
  });

  app.post('/api/tts', async (req: express.Request, res: express.Response) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }
      const { model, contents, generationConfig, stream } = req.body;
      const cleanModel = (model || 'gemini-3.8-flash-lite-tts').replace(/^models\//, '');

      if (stream) {
        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;
        const googleRes = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ contents, generationConfig }),
        });

        if (!googleRes.ok) {
          const errText = await googleRes.text();
          return res.status(googleRes.status).send(errText);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (googleRes.body) {
          const reader = googleRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        return res.end();
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const googleRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents, generationConfig }),
      });

      const data = await googleRes.json();
      if (!googleRes.ok) {
        return res.status(googleRes.status).json(data);
      }
      return res.json(data);
    } catch (err: any) {
      console.error('[TTS Proxy Error]', err);
      return res.status(500).json({ error: err.message || 'Server TTS error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[AetherAegis] Server initialized on http://localhost:${PORT}`);
  });
}

startServer();
