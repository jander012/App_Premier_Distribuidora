import express from 'express';
import next from 'next';
import apiApp from './backend/src/app.js';
import { env } from './backend/src/config/env.js';

const dev = env.nodeEnv !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

if (env.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('Defina JWT_SECRET com pelo menos 32 caracteres em produção.');
    process.exit(1);
  }
  if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY.length < 24) {
    console.error('Defina INTERNAL_API_KEY com pelo menos 24 caracteres em produção.');
    process.exit(1);
  }
}

await nextApp.prepare();

const app = express();

app.set('trust proxy', env.trustProxy);
app.use('/api', apiApp);
app.all('*', (req, res) => handle(req, res));

app
  .listen(env.port, () => {
    console.log(`App Premier em http://localhost:${env.port}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Porta ${env.port} em uso. Defina outra PORT ou encerre o outro processo.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
