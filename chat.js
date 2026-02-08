import { auth } from "./firebase.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Открыть чат ---
export function openChatWithFriend(friendUid) {
  currentChatUid = friendUid;
  if (unsubscribeChat) unsubscribeChat();
  subscribeToChat(friendUid);
}

// --- Отправить сообщение ---
export async function sendMessageToFriend(friendUid, text) {
  const user = auth.currentUser;
  const chatId = [user.uid, friendUid].sort().join("_");

  await addDoc(collection(db, "privateMessages", chatId, "messages"), {
    senderUid: user.uid,
    senderNick: user.displayName || user.email,
    text: text,
    timestamp: serverTimestamp()
  });
}

// --- Подписка на чат ---
function subscribeToChat(friendUid) {
  const user = auth.currentUser;
  const chatId = [user.uid, friendUid].sort().join("_");

  const messagesRef = collection(db, "privateMessages", chatId, "messages");
  const q = query(messagesRef, orderBy("timestamp"));

  unsubscribeChat = onSnapshot(q, (snapshot) => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.text) {
        chatBox.innerHTML += `<p><b>${data.senderNick}:</b> ${data.text}</p>`;
      }
    });
  });
}
