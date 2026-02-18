require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const processosRoutes = require('./routes/processosRoutes');
const atividadesRoutes = require('./routes/atividadesRoutes');
const documentosRoutes = require('./routes/documentosRoutes');
const documentosModelosRoutes = require('./routes/documentosModelosRoutes');
const financeiroRoutes = require('./routes/financeiroRoutes');
const publicacoesDjenRoutes = require('./routes/publicacoesDjenRoutes');
const escritoriosRoutes = require('./routes/escritoriosRoutes');
const ajustesRoutes = require('./routes/ajustesRoutes');
const { initDatabase } = require('./dbInit');
const { syncAllProcessos } = require('./services/processoAndamentosService');

const app = express();

const frontendPath = path.join(__dirname, '..', '..', 'frontend');
const noCache = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const isApiRequest = (req) => {
  const accept = String(req.headers.accept || '');
  const xrw = String(req.headers['x-requested-with'] || '');
  const authorization = String(req.headers.authorization || '');
  if (xrw) return true;
  if (authorization.startsWith('Bearer ')) return true;
  if (accept.includes('application/json')) return true;
  return false;
};

const sendPage = (filename) => (req, res, next) => {
  if (isApiRequest(req)) return next();
  noCache(res);
  return res.sendFile(path.join(frontendPath, 'pages', filename));
};

const redirectHtml = (fromPath, toPath) => {
  app.get(fromPath, (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `${toPath}${qs}`);
  });
};

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Escritorio-Id', 'X-Requested-With'],
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

redirectHtml('/login.html', '/login');
redirectHtml('/login.htlm', '/login');
redirectHtml('/dashboard.html', '/dashboard');
redirectHtml('/dashboard.htlm', '/dashboard');
redirectHtml('/clientes.html', '/clientes');
redirectHtml('/clientes.htlm', '/clientes');
redirectHtml('/cliente.html', '/cliente');
redirectHtml('/cliente.htlm', '/cliente');
redirectHtml('/processos.html', '/processos');
redirectHtml('/processos.htlm', '/processos');
redirectHtml('/processo.html', '/processo');
redirectHtml('/processo.htlm', '/processo');
redirectHtml('/atividades.html', '/atividades');
redirectHtml('/atividades.htlm', '/atividades');
redirectHtml('/documentos.html', '/documentos');
redirectHtml('/documentos.htlm', '/documentos');
redirectHtml('/financeiro.html', '/financeiro');
redirectHtml('/financeiro.htlm', '/financeiro');
redirectHtml('/ajustes.html', '/ajustes');
redirectHtml('/ajustes.htlm', '/ajustes');
redirectHtml('/publicacoes-djen.html', '/publicacoes-djen');
redirectHtml('/publicacoes-djen.htlm', '/publicacoes-djen');

app.get('/pages/:file', (req, res, next) => {
  const file = String(req.params.file || '');
  const lower = file.toLowerCase();
  if (!lower.endsWith('.html') && !lower.endsWith('.htlm')) return next();
  const base = file.replace(/\.(html|htlm)$/i, '');
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(302, `/${base}${qs}`);
});

app.get('/login', sendPage('login.html'));
app.get('/dashboard', sendPage('dashboard.html'));
app.get('/clientes', sendPage('clientes.html'));
app.get('/cliente', sendPage('cliente.html'));
app.get('/processos', sendPage('processos.html'));
app.get('/processo', sendPage('processo.html'));
app.get('/atividades', sendPage('atividades.html'));
app.get('/documentos', sendPage('documentos.html'));
app.get('/financeiro', sendPage('financeiro.html'));
app.get('/ajustes', sendPage('ajustes.html'));
app.get('/publicacoes-djen', sendPage('publicacoes-djen.html'));

app.use('/auth', authRoutes);
app.use('/clientes', clientesRoutes);
app.use('/processos', processosRoutes);
app.use('/atividades', atividadesRoutes);
app.use('/documentos', documentosRoutes);
app.use('/documentos-modelos', documentosModelosRoutes);
app.use('/financeiro-lancamentos', financeiroRoutes);
app.use('/publicacoes-djen', publicacoesDjenRoutes);
app.use('/escritorios', escritoriosRoutes);
app.use('/ajustes', ajustesRoutes);

// Some browsers will still probe /favicon.ico (and friends) regardless of <link rel="icon">.
// Serve the branded assets from the same place and disable caching to avoid "stuck" favicons.
app.get('/favicon.ico', (req, res) => {
  noCache(res);
  res.sendFile(path.join(frontendPath, 'assets', 'brand', 'favicon.ico'));
});
app.get('/favicon-16.png', (req, res) => {
  noCache(res);
  res.sendFile(path.join(frontendPath, 'assets', 'brand', 'favicon-16.png'));
});
app.get('/favicon-32.png', (req, res) => {
  noCache(res);
  res.sendFile(path.join(frontendPath, 'assets', 'brand', 'favicon-32.png'));
});
app.get('/apple-touch-icon.png', (req, res) => {
  noCache(res);
  res.sendFile(path.join(frontendPath, 'assets', 'brand', 'apple-touch-icon.png'));
});

app.use(
  '/assets',
  express.static(path.join(frontendPath, 'assets'), {
    setHeaders: (res) => noCache(res),
  })
);
app.use(
  '/pages',
  express.static(path.join(frontendPath, 'pages'), {
    setHeaders: (res) => noCache(res),
  })
);
app.use(
  express.static(path.join(frontendPath, 'pages'), {
    setHeaders: (res) => noCache(res),
  })
);
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages', 'login.html'));
});

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

const port = Number(process.env.PORT || 3000);

function scheduleDailySync() {
  const enabled = process.env.DATAJUD_DAILY_SYNC !== 'false';
  if (!enabled) return;

  const hour = Number(process.env.DATAJUD_DAILY_HOUR || 3);
  const minute = Number(process.env.DATAJUD_DAILY_MINUTE || 0);
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  const delay = next.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      await syncAllProcessos();
    } catch (err) {
      console.error('Falha ao sincronizar andamentos (lote):', err.message);
    } finally {
      scheduleDailySync();
    }
  }, delay);
}

(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Falha ao inicializar banco:', err.message);
  }

  app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });

  if (process.env.DATAJUD_API_KEY) {
    scheduleDailySync();
  }
})();
