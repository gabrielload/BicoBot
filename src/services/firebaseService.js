import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore/lite';
import { firebaseConfig } from '../config/firebaseConfig.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const getAvailableServices = async () => {
  const snapshot = await getDocs(collection(db, "profissionais"));
  const services = new Set();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (Array.isArray(data.servico)) {
      data.servico.forEach(s => services.add(s));
    }
  });
  return Array.from(services).sort();
};

export const findProfessionalsByServiceAndCep = async (service, cepPrefix) => {
  const professionalsRef = collection(db, "profissionais");
  const search = query(
    professionalsRef,
    where("servico", "array-contains", service),
    where("cep_prefixo", "==", parseInt(cepPrefix, 10))
  );
  return await getDocs(search);
};

export const findProfessionalsByCity = async (service, city) => {
  const professionalsRef = collection(db, "profissionais");
  const search = query(
    professionalsRef,
    where("servico", "array-contains", service),
    where("cidade", "==", city.toLowerCase())
  );
  return await getDocs(search);
};
