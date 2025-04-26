import { getAvailableServices, findProfessionalsByServiceAndCep, findProfessionalsByCity } from '../services/firebaseService.js';
import { getSession, refreshTimeout, resetSession } from '../services/sessionManager.js';

const cepPrefixMap = {
  "90": "porto alegre",
  "91": "porto alegre",
  "92": "canoas",
  "95": "pelotas",
  "11": "são paulo",
  "22": "rio de janeiro",
  "30": "belo horizonte"
};

const sendProfessionalList = async (sock, sender, snapshot) => {
  let response = "✨ Profissionais disponíveis no momento:\n\n";
  snapshot.forEach(doc => {
    const p = doc.data();
    const phone = (p.telefone || "").replace(/\D/g, '');
    const link = phone ? `https://wa.me/55${phone}` : "Não informado";
    response += `👤 Nome: ${p.nome}\n📞 Contato: ${link}\n⭐ Avaliação: ${p.nota ?? "Sem nota"}\n📝 Sobre: ${p.descricao}\n\n`;
  });
  response += "Posso ajudar com mais alguma coisa? (sim/não) 🦆";
  await sock.sendMessage(sender, { text: response });
};

export const handleMessage = async (sock, msg) => {
  if (!msg.message || msg.key.fromMe) return;

  const sender = msg.key.remoteJid;
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
  const session = getSession(sender);

  refreshTimeout(sock, sender);

  switch (session.step) {
    case 0:
      await sock.sendMessage(sender, { 
        text: `Oi oi! 🦆 Eu sou o Bico, seu assistente para encontrar profissionais incríveis pertinho de você! 💼✨\n\nEstou em versão beta, então se você puder me ajudar dando sugestões ou relatar algum probleminha, é só clicar aqui:\n📋 https://forms.gle/43j6g39jTyJNFvyG6\n\nVamos começar? Como posso te chamar? 😄` 
      });
      session.step = 1;
      break;

    case 1:
      session.data.nome = text.trim();
      const services = await getAvailableServices();
      if (services.length === 0) {
        await sock.sendMessage(sender, { text: "No momento não temos serviços cadastrados. Volte daqui a pouquinho, tá bom? 🦆💬" });
        resetSession(sender);
        return;
      }
      session.data.serviceOptions = services;

      const servicesList = services.map((service, index) => `${index + 1}. ${service}`).join('\n');

      await sock.sendMessage(sender, { 
        text: `Prazer em te conhecer, ${session.data.nome}! 😄🦆\n\nAqui estão os serviços disponíveis no momento:\n\n${servicesList}\n\nPor favor, envie apenas o número do serviço que você quer! 🔢` 
      });

      session.step = 2;
      break;

    case 2:
      const index = parseInt(text.trim(), 10) - 1;
      const service = session.data.serviceOptions?.[index];

      if (!service) {
        await sock.sendMessage(sender, { text: 'Ops! 😵‍💫 Por favor, envie apenas o número correspondente ao serviço. Vamos tentar de novo! 🦆' });
        return;
      }

      session.data.service = service;
      await sock.sendMessage(sender, { text: 'Ótima escolha! Agora me envie seu CEP para eu encontrar os profissionais mais pertinho de você! 📍' });
      session.step = 3;
      break;

    case 3:
      session.data.cep = text.trim();
      const prefix = session.data.cep.slice(0, 5);

      try {
        const result = await findProfessionalsByServiceAndCep(session.data.service, prefix);

        if (!result.empty) {
          await sendProfessionalList(sock, sender, result);
          session.step = 5;
        } else {
          const city = cepPrefixMap[session.data.cep.slice(0, 2)];
          if (city) {
            const cityResult = await findProfessionalsByCity(session.data.service, city);
            if (!cityResult.empty) {
              await sendProfessionalList(sock, sender, cityResult);
              session.step = 5;
            } else {
              await sock.sendMessage(sender, { text: "Hmm... não encontrei ninguém por esse CEP. 😔 Qual o nome da sua cidade? (exemplo: São Paulo) 🦆" });
              session.step = 6;
            }
          } else {
            await sock.sendMessage(sender, { text: "Não consegui identificar a cidade pelo CEP. 😔 Me diga o nome da sua cidade, por favor! 🦆" });
            session.step = 6;
          }
        }
      } catch (err) {
        console.error("Erro ao buscar profissionais:", err);
        await sock.sendMessage(sender, { text: "Tivemos um probleminha técnico... 🛠️ Poderia tentar novamente daqui a pouco? 🦆" });
        session.step = 0;
      }
      break;

    case 6:
      session.data.city = text.trim().toLowerCase();
      try {
        const cityResult = await findProfessionalsByCity(session.data.service, session.data.city);
        if (cityResult.empty) {
          await sock.sendMessage(sender, { text: "Poxa... 😔 Ainda não temos profissionais nessa cidade. Gostaria de tentar outra cidade? (responda sim ou não) 🦆" });
          session.step = 4;
        } else {
          await sendProfessionalList(sock, sender, cityResult);
          session.step = 5;
        }
      } catch (err) {
        console.error("Erro ao buscar cidade:", err);
        await sock.sendMessage(sender, { text: "Probleminha técnico aqui do meu lado... 😵‍💫 Pode tentar novamente? 🦆" });
        session.step = 0;
      }
      break;

    case 4:
      if (text.toLowerCase() === 'sim') {
        await sock.sendMessage(sender, { text: 'Beleza! Me mande o novo CEP por favor. 📍🦆' });
        session.step = 3;
      } else {
        await sock.sendMessage(sender, { text: 'Muito obrigado por conversar comigo! Foi um prazer te ajudar. Volte sempre que precisar! 🦆💬' });
        resetSession(sender);
      }
      break;

    case 5:
      if (text.toLowerCase() === 'sim') {
        const servicesAgain = await getAvailableServices();
        if (servicesAgain.length === 0) {
          await sock.sendMessage(sender, { text: "No momento não temos novos serviços cadastrados. Volte em breve! 🦆" });
          resetSession(sender);
          return;
        }
        session.data.serviceOptions = servicesAgain;

        const servicesListAgain = servicesAgain.map((service, index) => `${index + 1}. ${service}`).join('\n');

        await sock.sendMessage(sender, { 
          text: `Vamos lá! 🦆✨ Escolha outro serviço digitando o número correspondente:\n\n${servicesListAgain}` 
        });

        session.step = 2;
      } else {
        await sock.sendMessage(sender, { text: 'Espero ter ajudado! Quando precisar, estarei aqui. Um abraço do Bico! 🦆💬' });
        resetSession(sender);
      }
      break;
  }
};
