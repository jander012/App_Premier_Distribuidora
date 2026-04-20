import app from './app.js';
import { env } from './config/env.js';

if (env.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    // eslint-disable-next-line no-console
    console.error('Defina JWT_SECRET com pelo menos 32 caracteres em produção.');
    process.exit(1);
  }
  if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY.length < 24) {
    // eslint-disable-next-line no-console
    console.error('Defina INTERNAL_API_KEY com pelo menos 24 caracteres em produção.');
    process.exit(1);
  }
}

app
  .listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API delivery em http://localhost:${env.port}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        `Porta ${env.port} em uso. Defina outra PORT no backend/.env ou encerre o outro processo (o Vite usa VITE_API_PROXY_TARGET na mesma porta).`
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(err);
    }
    process.exit(1);
  });
