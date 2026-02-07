import { auth, db } from "./firebase.js";
import { addDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";

// Отправка сообщений
window.sendMessage = function() {
  const text = document.getElementById("msgText").value;
  if (!auth.currentUser) return alert("Сначала войди!");
  addDoc(collection(db, "messages"), {
    text,
    sender: auth.currentUser.email,
    timestamp: serverTimestamp()
  });
};

// Получение сообщений
const q = query(collection(db, "messages"), orderBy("timestamp"));
onSnapshot(q, snapshot => {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";
  snapshot.forEach(doc => {
    const msg = doc.data();
    messagesDiv.innerHTML += `<p><b>${msg.sender}:</b> ${msg.text}</p>`;
  });
});

// Добавление друзей
window.addFriend = function() {
  const email = document.getElementById("friendEmail").value;
  addDoc(collection(db, "friends"), {
    user: auth.currentUser.email,
    friend: email
  });
};
