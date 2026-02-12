const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');
const { loginOrCreateFromOAuth } = require('../services/oauthService');

const router = express.Router();

const hasGoogleOauth =
  process.env.OAUTH_GOOGLE_CLIENT_ID &&
  process.env.OAUTH_GOOGLE_CLIENT_SECRET &&
  process.env.OAUTH_GOOGLE_CALLBACK_URL;

if (hasGoogleOauth) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.OAUTH_GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = String(profile?.emails?.[0]?.value || '').toLowerCase();
          const nome = profile?.displayName || 'Usuário Google';
          if (!email) {
            return done(new Error('Google não retornou e-mail.'));
          }

          const authResult = await loginOrCreateFromOAuth({
            provider: 'google',
            providerId: profile?.id,
            email,
            nome,
            escritorioNome: `Escritorio de ${nome}`,
          });
          return done(null, authResult);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

const hasAppleOauth =
  process.env.OAUTH_APPLE_CLIENT_ID &&
  process.env.OAUTH_APPLE_TEAM_ID &&
  process.env.OAUTH_APPLE_KEY_ID &&
  process.env.OAUTH_APPLE_PRIVATE_KEY &&
  process.env.OAUTH_APPLE_CALLBACK_URL;

if (hasAppleOauth) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.OAUTH_APPLE_CLIENT_ID,
        teamID: process.env.OAUTH_APPLE_TEAM_ID,
        keyID: process.env.OAUTH_APPLE_KEY_ID,
        callbackURL: process.env.OAUTH_APPLE_CALLBACK_URL,
        privateKeyString: process.env.OAUTH_APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        passReqToCallback: false,
      },
      async (_accessToken, _refreshToken, idToken, profile, done) => {
        try {
          const email = String(profile?.email || idToken?.email || '').toLowerCase();
          const nome = profile?.name
            ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim()
            : email.split('@')[0] || 'Usuário Apple';

          if (!email) {
            return done(new Error('Apple não retornou e-mail.'));
          }

          const authResult = await loginOrCreateFromOAuth({
            provider: 'apple',
            providerId: idToken?.sub,
            email,
            nome,
            escritorioNome: `Escritorio de ${nome}`,
          });
          return done(null, authResult);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

function finalizeOauth(req, res) {
  const data = req.user;
  if (!data || !data.token) {
    return res.redirect('/?erro=oauth');
  }

  res.cookie('token', data.token, {
    httpOnly: true,
    sameSite: 'lax',
  });
  res.cookie('token_js', data.token, {
    httpOnly: false,
    sameSite: 'lax',
  });

  return res.redirect(`/dashboard.html?token=${encodeURIComponent(data.token)}`);
}

router.post('/login', authController.login);
router.post('/register/start', authController.registerStart);
router.post('/register/verify', authController.registerVerify);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, attachEscritorioContext, authController.me);

router.get('/oauth/google/start', (req, res, next) => {
  if (!hasGoogleOauth) return res.status(503).json({ erro: 'OAuth Google não configurado.' });
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
router.get(
  '/oauth/google/callback',
  (req, res, next) => {
    if (!hasGoogleOauth) return res.redirect('/?erro=oauth');
    return passport.authenticate('google', { session: false, failureRedirect: '/?erro=oauth' })(
      req,
      res,
      next
    );
  },
  finalizeOauth
);

router.get('/oauth/apple/start', (req, res, next) => {
  if (!hasAppleOauth) return res.status(503).json({ erro: 'OAuth Apple não configurado.' });
  return passport.authenticate('apple', { scope: ['name', 'email'] })(req, res, next);
});
router.get(
  '/oauth/apple/callback',
  (req, res, next) => {
    if (!hasAppleOauth) return res.redirect('/?erro=oauth');
    return passport.authenticate('apple', { session: false, failureRedirect: '/?erro=oauth' })(
      req,
      res,
      next
    );
  },
  finalizeOauth
);
router.post(
  '/oauth/apple/callback',
  (req, res, next) => {
    if (!hasAppleOauth) return res.redirect('/?erro=oauth');
    return passport.authenticate('apple', { session: false, failureRedirect: '/?erro=oauth' })(
      req,
      res,
      next
    );
  },
  finalizeOauth
);

module.exports = router;
