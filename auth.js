import { auth } from "./firebase.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

// --- Регистрация ---
window.register = async function() {
  const email = document.getElementById("regEmail").value.trim();
  const pass = document.getElementById("regPass").value.trim();
  const nick = document.getElementById("regNick").value.trim();

  try {
    // Создаём пользователя в Firebase Auth
    const userCred = await createUserWithEmailAndPassword(auth, email, pass);

    // Обновляем профиль (ник)
    await updateProfile(userCred.user, { displayName: nick });

    // --- ВАЖНО: создаём документ в Firestore ---
    await setDoc(doc(db, "users", userCred.user.uid), {
      uid: userCred.user.uid,
      email: email,
      nick: nick,
      photoURL: null,
      friends: [],
      pending: [],
      requestsSent: []
    });

    alert("Регистрация успешна!");
    window.location.href = "main.html";
  } catch (err) {
    alert(err.message);
  }
};

// --- Вход ---
window.login = async function() {
  const email = document.getElementById("logEmail").value.trim();
  const pass = document.getElementById("logPass").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    window.location.href = "main.html";
  } catch (err) {
    alert(err.message);
  }
};
