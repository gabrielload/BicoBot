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
  const listResponse = msg.message?.listResponseMessage;
  const session = getSession(sender);

  refreshTimeout(sock, sender);

  switch (session.step) {
    case 0:
      await sock.sendMessage(sender, { text: `Oi! Eu sou o Bico... Vamos começar? Me diz como posso te chamar. 😄` });
      session.step = 1;
      break;

    case 1:
      session.data.nome = text.trim();
      const services = await getAvailableServices();
      if (services.length === 0) {
        await sock.sendMessage(sender, { text: "No momento não temos serviços cadastrados. Volte daqui a pouquinho! 😉" });
        resetSession(sender);
        return;
      }
      session.data.serviceOptions = services;

      const rows = services.map((service, index) => ({
        title: service,
        rowId: `service_${index}`
      }));

      await sock.sendMessage(sender, {
        text: `Prazer, ${session.data.nome}! Escolha o serviço que você está buscando:`,
        sections: [{
          title: "Serviços Disponíveis",
          rows
        }],
        buttonText: "Escolher Serviço",
        headerType: 1
      }, { quoted: msg });

      session.step = 2;
      break;

    case 2:
      let service;
      if (listResponse) {
        const selectedId = listResponse.singleSelectReply.selectedRowId;
        const index = parseInt(selectedId.split('_')[1], 10);
        service = session.data.serviceOptions?.[index];
      } else {
        const index = parseInt(text.trim(), 10) - 1;
        service = session.data.serviceOptions?.[index];
      }

      if (!service) {
        await sock.sendMessage(sender, { text: 'Por favor, selecione uma opção da lista ou envie o número correto. 🦆' });
        return;
      }

      session.data.service = service;
      await sock.sendMessage(sender, { text: 'Agora me manda seu CEP pra buscar os profissionais! 🗺️' });
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
              await sock.sendMessage(sender, { text: "Hmm, não encontrei... Qual o nome da sua cidade? 🦆" });
              session.step = 6;
            }
          } else {
            await sock.sendMessage(sender, { text: "Não consegui identificar a cidade pelo CEP. Me diga o nome dela. 🦆" });
            session.step = 6;
          }
        }
      } catch (err) {
        console.error("Erro ao buscar profissionais:", err);
        await sock.sendMessage(sender, { text: "Tivemos um probleminha aqui... tente novamente. 🦆" });
        session.step = 0;
      }
      break;

    case 6:
      session.data.city = text.trim().toLowerCase();
      try {
        const cityResult = await findProfessionalsByCity(session.data.service, session.data.city);
        if (cityResult.empty) {
          await sock.sendMessage(sender, { text: "Ainda não temos profissionais aí. Quer tentar outra cidade? (sim/não)" });
          session.step = 4;
        } else {
          await sendProfessionalList(sock, sender, cityResult);
          session.step = 5;
        }
      } catch (err) {
        console.error("Erro ao buscar cidade:", err);
        await sock.sendMessage(sender, { text: "Problema na busca... tente de novo! 🦆" });
        session.step = 0;
      }
      break;

    case 4:
      if (text.toLowerCase() === 'sim') {
        await sock.sendMessage(sender, { text: 'Me mande outro CEP! 🦆' });
        session.step = 3;
      } else {
        await sock.sendMessage(sender, { text: 'Obrigado! Até a próxima! 👋' });
        resetSession(sender);
      }
      break;

    case 5:
      if (text.toLowerCase() === 'sim') {
        const servicesAgain = await getAvailableServices();
        if (servicesAgain.length === 0) {
          await sock.sendMessage(sender, { text: "Sem novos serviços no momento. 🦆" });
          resetSession(sender);
          return;
        }
        session.data.serviceOptions = servicesAgain;

        const rowsAgain = servicesAgain.map((service, index) => ({
          title: service,
          rowId: `service_${index}`
        }));

        await sock.sendMessage(sender, {
          text: `Escolha outro serviço:`,
          sections: [{
            title: "Serviços Disponíveis",
            rows: rowsAgain
          }],
          buttonText: "Escolher Serviço",
          headerType: 1
        }, { quoted: msg });

        session.step = 2;
      } else {
        await sock.sendMessage(sender, { text: 'Até mais! 🦆' });
        resetSession(sender);
      }
      break;
  }
};
