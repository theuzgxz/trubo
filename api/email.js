/**
 * api/email.js — Serviço de envio de e-mails automáticos via SMTP (Nodemailer)
 */

const nodemailer = require('nodemailer');

// Cria o transporter de SMTP usando variáveis de ambiente
function getTransporter() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT, 10);
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    console.warn('\n⚠️ [SMTP WARNING] Variáveis de e-mail (EMAIL_HOST, EMAIL_USER, EMAIL_PASS) não configuradas no Render. Os e-mails de confirmação não serão enviados para os clientes.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false // Evita erros de certificados inválidos ou auto-assinados de alguns provedores
    }
  });
}

/**
 * Envia um e-mail de confirmação de compra aprovada
 * @param {string} email - E-mail do cliente
 * @param {string} name - Nome completo ou primeiro nome do cliente
 * @param {string} orderId - ID da transação
 * @param {number} amountCents - Valor em centavos (ex: 700 para R$ 7,00)
 */
async function sendConfirmationEmail(email, name, orderId, amountCents) {
  try {
    const transporter = getTransporter();
    if (!transporter) return false;

    const formattedAmount = (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const from = process.env.EMAIL_FROM || '"Dream Sleep" <contato@dreamsleep.com>';
    const firstName = name ? name.split(' ')[0] : 'Cliente';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Pedido Confirmado - Dream Sleep</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f7fafc; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #4a5568;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #000000; padding: 30px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Dream Sleep</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1a202c; margin-top: 0; margin-bottom: 20px; font-size: 20px; font-weight: 700;">Olá, ${firstName}! 👋</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #4a5568; margin-bottom: 20px;">
                Temos ótimas notícias! O pagamento do seu pedido foi **aprovado** e confirmado com sucesso. 🎉
              </p>
              
              <div style="background-color: #f8fafc; border: 1px solid #edf2f7; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #2d3748; font-weight: 700; border-bottom: 1px solid #edf2f7; padding-bottom: 10px;">Resumo do Pedido</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px; color: #718096;">Código do Pedido:</td>
                    <td style="padding: 5px 0; font-size: 14px; color: #2d3748; font-weight: bold; text-align: right;">#${orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px; color: #718096;">Valor Total:</td>
                    <td style="padding: 5px 0; font-size: 14px; color: #2d3748; font-weight: bold; text-align: right;">${formattedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; font-size: 14px; color: #718096;">Status:</td>
                    <td style="padding: 5px 0; font-size: 14px; color: #10b981; font-weight: bold; text-align: right;">Confirmado e Pago</td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-bottom: 15px;">
                📦 <strong>O que acontece agora?</strong><br>
                Seu produto já está entrando em fase de <strong>preparação e embalagem</strong>. Ele será despachado em breve!
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-bottom: 15px;">
                🚚 <strong>Prazo de Entrega:</strong><br>
                A estimativa de entrega na sua casa é de <strong>6 a 7 dias corridos</strong> a partir de hoje.
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-bottom: 25px;">
                📧 <strong>Rastreamento:</strong><br>
                Assim que sua encomenda for entregue aos Correios ou à transportadora, nós lhe enviaremos <strong>um novo e-mail contendo o código de rastreamento oficial</strong> para você acompanhar a entrega em tempo real.
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-bottom: 0;">
                Se tiver qualquer dúvida, basta responder diretamente a este e-mail. Nossa equipe de suporte está pronta para te atender!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f7fafc; padding: 20px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0;">
              &copy; ${new Date().getFullYear()} Dream Sleep. Todos os direitos reservados.<br>
              Esta é uma mensagem automática de confirmação de transação comercial.
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from,
      to: email,
      subject: `Pedido Confirmado! Seu Dream Sleep está a caminho (#${orderId})`,
      html: htmlContent
    });

    console.log(`[EMAIL SUCCESS] E-mail de confirmação enviado com sucesso para ${email} (MessageID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error('[EMAIL ERROR] Falha ao enviar e-mail de confirmação:', error.message);
    return false;
  }
}

module.exports = {
  sendConfirmationEmail
};
