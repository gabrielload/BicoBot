// =======================
// 📦 IMPORTAÇÕES
// =======================
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore/lite';

// =======================
// 🔧 CONFIGURAÇÃO DO FIREBASE
// =======================
const firebaseConfig = {
  apiKey: "AIzaSyAHG-CSJzOhmuYpjM9i6cEqBJtGDqxuSD8",
  authDomain: "bicudos-c9ff0.firebaseapp.com",
  projectId: "bicudos-c9ff0",
  storageBucket: "bicudos-c9ff0.appspot.com",
  messagingSenderId: "81469971834",
  appId: "1:81469971834:web:43100abd81b5b3d2e80ac3",
  measurementId: "G-JT1CX0HTKB"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// =======================
// 🗂️ VARIÁVEIS GLOBAIS
// =======================
const sessions = {};
const cepPrefixMap = {
  "90": "porto alegre",
  "91": "porto alegre",
  "92": "canoas",
  "95": "pelotas",
  "11": "são paulo",
  "22": "rio de janeiro",
  "30": "belo horizonte"
};

// =======================
// 🧰 UTILITÁRIOS
// =======================
const getServicosDisponiveis = async () => {
  const snapshot = await getDocs(collection(db, "profissionais"));
  const servicosSet = new Set();
  snapshot.forEach(doc => {
    const dados = doc.data();
    if (Array.isArray(dados.servico)) {
      dados.servico.forEach(s => servicosSet.add(s));
    }
  });
  return Array.from(servicosSet).sort();
};

const mostrarProfissionais = async (sock, sender, snapshot) => {
  let resposta = "✨ Profissionais disponíveis no momento:\n\n";

  snapshot.forEach(doc => {
    const p = doc.data();
    const numeroLimpo = (p.telefone || "").replace(/\D/g, '');
    const link = numeroLimpo ? `https://wa.me/55${numeroLimpo}` : null;

    resposta += `👤 Nome: ${p.nome}\n`;
    resposta += link
      ? `📞 Contato: ${link}\n`
      : `📞 Contato: Não informado\n`;
    resposta += `⭐ Avaliação: ${p.nota ?? "Sem nota"}\n`;
    resposta += `📝 Sobre: ${p.descricao}\n\n`;
  });

  resposta += "Posso ajudar com mais alguma coisa? (sim/não) 🦆";
  await sock.sendMessage(sender, { text: resposta });
};

// =======================
// 🤖 CONEXÃO WHATSAPP
// =======================
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
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : 0) !== DisconnectReason.loggedOut;

      console.log('🔌 Conexão encerrada', shouldReconnect ? '🔄 Reconectando...' : '⛔ Deslogado');
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp! 🎉');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (!sessions[sender]) sessions[sender] = { step: 0, data: {} };

    if (sessions[sender].timeout) clearTimeout(sessions[sender].timeout);
    sessions[sender].timeout = setTimeout(() => {
      sock.sendMessage(sender, {
        text: "Tudo bem por aí? Vou encerrar nosso papo por enquanto. Quando quiser, é só me chamar de novo. 🦆"
      });
      delete sessions[sender];
    }, 5 * 60 * 1000);

    const session = sessions[sender];

    switch (session.step) {
      case 0:
        await sock.sendMessage(sender, {
          text: `Oi! Eu sou o Bico, seu assistente para encontrar profissionais incríveis pertinho de você. 💼🦆\n\nEstou em versão beta, então se algo parecer estranho, você pode me ajudar com sugestões aqui:\n📋 https://forms.gle/43j6g39jTyJNFvyG6\n\nVamos começar? Me diz como posso te chamar. 😄`
        });
        session.step = 1;
        break;

      case 1:
        session.data.nome = text.trim();
        const servicos = await getServicosDisponiveis();

        if (servicos.length === 0) {
          await sock.sendMessage(sender, {
            text: "No momento não temos serviços cadastrados. Volte daqui a pouquinho! 😉"
          });
          delete sessions[sender];
          return;
        }

        session.data.servicoOptions = servicos;
        const opcoesTexto = servicos.map((s, i) => `${i + 1}. ${s}`).join('\n');

        await sock.sendMessage(sender, {
          text: `Prazer, ${session.data.nome}! 😄 Escolha o serviço que você está buscando:\n\n${opcoesTexto}`
        });
        session.step = 2;
        break;

      case 2:
        const index = parseInt(text.trim(), 10) - 1;
        const servico = session.data.servicoOptions?.[index];
        if (!servico) {
          await sock.sendMessage(sender, {
            text: 'Por favor, envie só o número do serviço que você quer. 🦆'
          });
          return;
        }
        session.data.servico = servico;
        await sock.sendMessage(sender, {
          text: 'Agora me manda seu CEP pra eu buscar os profissionais mais próximos. 🗺️'
        });
        session.step = 3;
        break;

      case 3:
        session.data.cep = text.trim();
        const prefixo = session.data.cep.slice(0, 5);
        const profissionaisRef = collection(db, "profissionais");

        try {
          const buscaPorCep = query(
            profissionaisRef,
            where("servico", "array-contains", session.data.servico),
            where("cep_prefixo", "==", parseInt(prefixo, 10))
          );
          const resultado = await getDocs(buscaPorCep);

          if (!resultado.empty) {
            await mostrarProfissionais(sock, sender, resultado);
            session.step = 5;
          } else {
            const cidade = cepPrefixMap[session.data.cep.slice(0, 2)];
            if (cidade) {
              const buscaCidade = query(
                profissionaisRef,
                where("servico", "array-contains", session.data.servico),
                where("cidade", "==", cidade)
              );
              const resCidade = await getDocs(buscaCidade);

              if (!resCidade.empty) {
                await mostrarProfissionais(sock, sender, resCidade);
                session.step = 5;
              } else {
                await sock.sendMessage(sender, {
                  text: "Hmm, não encontrei ninguém com esse CEP. Qual o nome da sua cidade? (ex: São Paulo) 🦆"
                });
                session.step = 6;
              }
            } else {
              await sock.sendMessage(sender, {
                text: "Não consegui identificar a cidade pelo CEP. Me diga o nome dela (ex: São Paulo). 🦆"
              });
              session.step = 6;
            }
          }
        } catch (err) {
          console.error("Erro ao buscar profissionais:", err);
          await sock.sendMessage(sender, {
            text: "Tivemos um probleminha aqui... pode tentar de novo em instantes? 🦆"
          });
          session.step = 0;
        }
        break;

      case 6:
        session.data.cidade = text.trim().toLowerCase();
        try {
          const buscaCidadeManual = query(
            collection(db, "profissionais"),
            where("servico", "array-contains", session.data.servico),
            where("cidade", "==", session.data.cidade)
          );
          const resultado = await getDocs(buscaCidadeManual);

          if (resultado.empty) {
            await sock.sendMessage(sender, {
              text: "Poxa, ainda não temos profissionais nessa cidade. Quer tentar outra? (sim/não)"
            });
            session.step = 4;
          } else {
            await mostrarProfissionais(sock, sender, resultado);
            session.step = 5;
          }
        } catch (err) {
          console.error("Erro ao buscar por cidade:", err);
          await sock.sendMessage(sender, {
            text: "Algo deu errado na busca... me perdoa! 🦆"
          });
          session.step = 0;
        }
        break;

      case 4:
        if (text.toLowerCase() === 'sim') {
          await sock.sendMessage(sender, {
            text: 'Me manda outro CEP que eu tento de novo! 🦆'
          });
          session.step = 3;
        } else {
          await sock.sendMessage(sender, {
            text: 'Obrigado por conversar comigo! Até a próxima. 👋'
          });
          delete sessions[sender];
        }
        break;

      case 5:
        if (text.toLowerCase() === 'sim') {
          const servicos = await getServicosDisponiveis();
          if (servicos.length === 0) {
            await sock.sendMessage(sender, {
              text: "No momento não temos outros serviços. Volte em breve, tá bom? 🦆"
            });
            delete sessions[sender];
            return;
          }

          session.data.servicoOptions = servicos;
          const opcoesTexto = servicos.map((s, i) => `${i + 1}. ${s}`).join('\n');

          await sock.sendMessage(sender, {
            text: `Claro! Escolha o próximo serviço que você precisa:\n\n${opcoesTexto}`
          });
          session.step = 2;
        } else {
          await sock.sendMessage(sender, {
            text: 'Foi um prazer te ajudar! Volte quando quiser. 🦆'
          });
          delete sessions[sender];
        }
        break;
    }
  });
};

process.on('unhandledRejection', reason => {
  console.error('🚨 Unhandled Rejection:', reason);
});

connectToWhatsApp();
