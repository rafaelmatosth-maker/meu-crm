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

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Escritorio-Id'],
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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

const frontendPath = path.join(__dirname, '..', '..', 'frontend');
const noCache = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};
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
