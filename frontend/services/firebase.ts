// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAUa7V2Qe-Qmh7CgNW8RJcdG_nbQUR6CWU",
  authDomain: "campus-builder.firebaseapp.com",
  projectId: "campus-builder",
  storageBucket: "campus-builder.firebasestorage.app",
  messagingSenderId: "913660773536",
  appId: "1:913660773536:web:2948475b5154d41aa735c5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);