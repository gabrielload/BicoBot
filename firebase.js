// firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 🔐 Substitua com as suas credenciais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAHG-CSJzOhmuYpjM9i6cEqBJtGDqxuSD8",
    authDomain: "bicudos-c9ff0.firebaseapp.com",
    projectId: "bicudos-c9ff0",
    storageBucket: "bicudos-c9ff0.appspot.com",
    messagingSenderId: "81469971834",
    appId: "1:81469971834:web:43100abd81b5b3d2e80ac3",
    measurementId: "G-JT1CX0HTKB"
  };

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
