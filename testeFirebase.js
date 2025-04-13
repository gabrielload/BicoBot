// criarProfissionais.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAHG-CSJzOhmuYpjM9i6cEqBJtGDqxuSD8",
  authDomain: "bicudos-c9ff0.firebaseapp.com",
  projectId: "bicudos-c9ff0",
  storageBucket: "bicudos-c9ff0.appspot.com",
  messagingSenderId: "81469971834",
  appId: "1:81469971834:web:43100abd81b5b3d2e80ac3",
  measurementId: "G-JT1CX0HTKB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function criarProfissionalIsabella() {
  try {
    const profissional = {
      nome: "Isabella Daneluz",
      descricao:
        "Bibliotecária com experiência em normalização de trabalhos acadêmicos nas normas ABNT, APA, VANCOUVER; fichas catalográficas para livros e trabalhos acadêmicos",
      telefone: "54 999038342",
      cep: "90050321",
      cep_prefixo: 90050,
      cidade: "porto alegre",
      servico: [
        "Normalização de trabalhos acadêmicos (ABNT, APA, VANCOUVER)",
        "Fichas catalográficas para livros e trabalhos acadêmicos"
      ],
      nota: 4.9
    };

    await addDoc(collection(db, "profissionais"), profissional);

    console.log("✅ Isabella Daneluz adicionada com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao adicionar profissional:", error);
  }
}

criarProfissionalIsabella();
