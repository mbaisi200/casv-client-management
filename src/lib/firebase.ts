import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDSX2NyeFocQ90bXMkbqw0MjusLAsPsNeg",
  authDomain: "consulado-6ea4f.firebaseapp.com",
  projectId: "consulado-6ea4f",
  storageBucket: "consulado-6ea4f.firebasestorage.app",
  messagingSenderId: "126900042778",
  appId: "1:126900042778:web:221abb26044e97cc66e5a3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
