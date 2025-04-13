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
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia! ☀️';
  if (hour < 18) return 'Boa tarde! 🌤️';
  return 'Boa noite! 🌙';
};

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
  let resposta = "🦆 Profissionais encontrados com muito carinho:\n\n";

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

  resposta += "❓ Posso te ajudar com mais alguma coisa? (sim/não) 🦆";
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
        text: "😴 Acho que você se ausentou... Quando quiser, é só me chamar de novo! 🦆"
      });
      delete sessions[sender];
      console.log(`⌛ Sessão expirada para ${sender}`);
    }, 5 * 60 * 1000);

    const session = sessions[sender];

    switch (session.step) {
      case 0:
        await sock.sendMessage(sender, {
          text: `🦆 Olá! Eu sou o Bico, seu assistente virtual que conecta você com profissionais incríveis! 💼✨\n\n🚧 Estou em versão beta, então se algo der errado, me avisa aqui:\n📋 https://forms.gle/seu-link-aqui\n\nVamos começar? 😄`
        });
        await delay(2000);
        await sock.sendMessage(sender, {
          text: `${getGreeting()} Como posso te chamar? 😊`
        });
        session.step = 1;
        break;

      case 1:
        session.data.nome = text.trim();
        const servicos = await getServicosDisponiveis();

        if (servicos.length === 0) {
          await sock.sendMessage(sender, {
            text: "⚠️ Nenhum serviço disponível no momento. Tente novamente mais tarde, tá bem? 🦆"
          });
          delete sessions[sender];
          return;
        }

        session.data.servicoOptions = servicos;
        const opcoesTexto = servicos.map((s, i) => `${i + 1}. ${s}`).join('\n');

        await sock.sendMessage(sender, {
          text: `Prazer, ${session.data.nome}! 😄 Escolha um dos serviços abaixo que você está procurando:\n\n${opcoesTexto}`
        });
        session.step = 2;
        break;
// olá
      case 2:
        const index = parseInt(text.trim(), 10) - 1;
        const servico = session.data.servicoOptions?.[index]; 
        if (!servico) {
          await sock.sendMessage(sender, {
            text: '❗ Por favor, envie apenas o número correspondente ao serviço desejado. 🦆'
          });
          return;
        }
        session.data.servico = servico;
        await sock.sendMessage(sender, {
          text: '📍 Agora me diga seu CEP para encontrarmos os melhores profissionais próximos de você! 😊'
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
                  text: "😕 Não achei ninguém com esse CEP... Qual é sua cidade? (ex: São Paulo) 🦆"
                });
                session.step = 6;
              }
            } else {
              await sock.sendMessage(sender, {
                text: "📮 Não consegui identificar sua cidade pelo CEP. Digite o nome da sua cidade (ex: São Paulo). 🦆"
              });
              session.step = 6;
            }
          }
        } catch (err) {
          console.error("❌ Erro ao buscar profissionais:", err);
          await sock.sendMessage(sender, {
            text: "⚠️ Ocorreu um erro inesperado. Tente novamente mais tarde! 🦆"
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
              text: "😔 Ainda não temos profissionais nessa cidade. Quer tentar outra? (sim/não)"
            });
            session.step = 4;
          } else {
            await mostrarProfissionais(sock, sender, resultado);
            session.step = 5;
          }
        } catch (err) {
          console.error("❌ Erro ao buscar por cidade:", err);
          await sock.sendMessage(sender, {
            text: "⚠️ Algo deu errado na busca. Me desculpe! 🦆"
          });
          session.step = 0;
        }
        break;

      case 4:
        if (text.toLowerCase() === 'sim') {
          await sock.sendMessage(sender, {
            text: '📮 Qual o novo CEP? Vamos tentar de novo! 🦆'
          });
          session.step = 3;
        } else {
          await sock.sendMessage(sender, {
            text: '🦆 Obrigado por usar o Bico! Até a próxima! 👋'
          });
          delete sessions[sender];
        }
        break;

      case 5:
        if (text.toLowerCase() === 'sim') {
          const servicos = await getServicosDisponiveis();
          if (servicos.length === 0) {
            await sock.sendMessage(sender, {
              text: "⚠️ Nenhum serviço disponível no momento. Tente mais tarde, tá bom? 🦆"
            });
            delete sessions[sender];
            return;
          }

          session.data.servicoOptions = servicos;
          const opcoesTexto = servicos.map((s, i) => `${i + 1}. ${s}`).join('\n');

          await sock.sendMessage(sender, {
            text: `Beleza! Escolha o novo serviço que você precisa. 😄\n\n${opcoesTexto}`
          });
          session.step = 2;
        } else {
          await sock.sendMessage(sender, {
            text: '🦆 Foi um prazer te ajudar! Até logo! 👋'
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
