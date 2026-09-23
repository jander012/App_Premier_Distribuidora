import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

let transporter;

function getTransporter() {
  if (!env.smtpHost || !env.mailFrom) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser
        ? {
            user: env.smtpUser,
            pass: env.smtpPassword,
          }
        : undefined,
    });
  }
  return transporter;
}

export async function sendAdminAccessCode({ to, name, code }) {
  const tx = getTransporter();
  if (!tx) {
    if (env.nodeEnv !== 'production') {
      console.log(`[admin-login] Código de acesso para ${to}: ${code}`);
      return { ok: true, provider: 'console' };
    }
    throw new Error('Envio de e-mail não configurado.');
  }

  await tx.sendMail({
    from: env.mailFrom,
    to,
    subject: 'Código de acesso ao painel Premier Distribuidora',
    text: [
      `Olá${name ? `, ${name}` : ''}.`,
      '',
      `Seu código de acesso ao painel administrativo é: ${code}`,
      '',
      `O código expira em ${env.adminOtpExpiresMinutes} minutos. Se você não solicitou este acesso, ignore esta mensagem.`,
    ].join('\n'),
  });

  return { ok: true, provider: 'smtp' };
}
