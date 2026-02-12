async function sendWithResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurada.');
  }
  if (!from) {
    throw new Error('EMAIL_FROM não configurado.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error || 'Falha ao enviar e-mail.';
    throw new Error(detail);
  }

  return data;
}

async function sendVerificationCodeEmail({ to, codigo, nomeEscritorio }) {
  const provider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();

  if (provider === 'resend') {
    const subject = `Código de verificação - ${nomeEscritorio || 'Meu CRM'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #111; max-width: 520px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">Confirme seu cadastro</h2>
        <p style="margin-top: 0; color: #444;">Use o código abaixo para finalizar a criação da sua conta.</p>
        <div style="font-size: 32px; letter-spacing: 6px; font-weight: 700; margin: 20px 0;">${codigo}</div>
        <p style="color: #666;">Este código expira em 10 minutos.</p>
      </div>
    `;
    await sendWithResend({ to, subject, html });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[cadastro] Código para ${to}: ${codigo}`);
    return;
  }

  throw new Error('Provedor de e-mail não configurado. Defina EMAIL_PROVIDER=resend.');
}

module.exports = {
  sendVerificationCodeEmail,
};
