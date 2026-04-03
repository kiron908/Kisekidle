// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace this with your copied firebaseConfig object!
const firebaseConfig = {
  apiKey: "AIzaSyD9S2FiYfLmN1RxlXo661BgnE0QwZCXRI8",
  authDomain: "kisekidle-5cf1c.firebaseapp.com",
  projectId: "kisekidle-5cf1c",
  storageBucket: "kisekidle-5cf1c.firebasestorage.app",
  messagingSenderId: "555403280974",
  appId: "1:555403280974:web:cb445fd9b9e82efcc8f91f",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
