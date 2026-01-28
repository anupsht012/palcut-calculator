import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyD0Yz56yCb2KiqXMGzL_QwyChWJ8Dg_P0s",
  authDomain: "palcut-calculator.firebaseapp.com",
  projectId: "palcut-calculator",
  storageBucket: "palcut-calculator.firebasestorage.app",
  messagingSenderId: "989962419105",
  appId: "1:989962419105:web:873a14a507d4b4099229e0",
  measurementId: "G-K3627RC8F3"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const GAME_ID = "palcut_live_session";