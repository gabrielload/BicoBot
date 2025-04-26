import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { handleMessage } from './handlers/messageHandler.js';

const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0) !== DisconnectReason.loggedOut;
      console.log('🔌 Conexão encerrada', shouldReconnect ? '🔄 Reconectando...' : '⛔ Deslogado');
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp! 🎉');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    await handleMessage(sock, msg);
  });
};

process.on('unhandledRejection', reason => {
  console.error('🚨 Unhandled Rejection:', reason);
});

connectToWhatsApp();
