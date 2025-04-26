const sessions = {};

const TIMEOUT = 5 * 60 * 1000; // 5 minutos

export const getSession = (sender) => {
  if (!sessions[sender]) {
    sessions[sender] = { step: 0, data: {} };
  }
  return sessions[sender];
};

export const resetSession = (sender) => {
  delete sessions[sender];
};

export const refreshTimeout = (sock, sender) => {
  const session = sessions[sender];
  if (!session) return;

  if (session.timeout) clearTimeout(session.timeout);

  session.timeout = setTimeout(() => {
    sock.sendMessage(sender, {
      text: "Tudo bem por aí? Vou encerrar nosso papo por enquanto. Quando quiser, é só me chamar de novo. 🦆"
    });
    resetSession(sender);
  }, TIMEOUT);
};
