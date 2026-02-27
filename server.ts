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
