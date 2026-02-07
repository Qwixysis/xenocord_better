import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

window.register = async function() {
  const nick = document.getElementById("regNick").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const pass = document.getElementById("regPass").value;
  const remember = document.getElementById("regRemember").checked;

  if (!nick) {
    alert("Введите никнейм!");
    return;
  }

  try {
    const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);

    const userCred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCred.user, { displayName: nick });

    // создаём документ в Firestore
    await setDoc(doc(db, "users", nick), {
      uid: userCred.user.uid,
      email: email,
      friends: [],
      pending: [],
      requestsSent: []
    });
  } catch (err) {
    alert(err.message);
  }
};

window.login = async function() {
  const email = document.getElementById("logEmail").value.trim();
  const pass = document.getElementById("logPass").value;
  const remember = document.getElementById("logRemember").checked;

  try {
    const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);

    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    alert(err.message);
  }
};

onAuthStateChanged(auth, user => {
  if (user) {
    window.location.href = "main.html";
  }
});
