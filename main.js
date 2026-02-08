import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// Следим за юзером
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("userUid").textContent = user.uid;
    // Создаем профиль в БД, если его нет
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await updateDoc(userRef, { nick: user.displayName || "Новичок", email: user.email, friends: [], pending: [] });
    }
    loadFriends(user.uid);
  }
});

// Добавление друга по UID
window.sendFriendRequest = async function() {
  const friendUid = document.getElementById("friendUidInput").value.trim();
  const currentUser = auth.currentUser;
  
  if (!friendUid || friendUid === currentUser.uid) return alert("Неверный UID");

  try {
    const friendRef = doc(db, "users", friendUid);
    await updateDoc(friendRef, { pending: arrayUnion(currentUser.uid) });
    alert("Запрос отправлен!");
  } catch (e) {
    alert("Пользователь не найден");
  }
};

// Загрузка списка друзей
function loadFriends(uid) {
  onSnapshot(doc(db, "users", uid), async (snap) => {
    const data = snap.data();
    const list = document.getElementById("friendsList");
    list.innerHTML = "";
    
    for (const fUid of (data.friends || [])) {
      const fSnap = await getDoc(doc(db, "users", fUid));
      const fData = fSnap.data();
      list.innerHTML += `
        <div class="friend-item">
          <span>${fData?.nick || 'Без имени'}</span>
          <button onclick="openChatWithFriend('${fUid}')">Чат</button>
          <button onclick="removeFriend('${fUid}')" style="background:#f04747">Удалить</button>
        </div>`;
    }
  });
}

// Удаление друга
window.removeFriend = async function(friendUid) {
  const myUid = auth.currentUser.uid;
  await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(friendUid) });
  await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(myUid) });
};

// Чат
window.openChatWithFriend = function(fUid) {
  currentChatUid = fUid;
  const chatId = [auth.currentUser.uid, fUid].sort().join("_");
  
  if (unsubscribeChat) unsubscribeChat();
  
  const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
  unsubscribeChat = onSnapshot(q, (snap) => {
    const box = document.getElementById("chatBox");
    box.innerHTML = snap.docs.map(d => `<div class="msg"><b>${d.data().senderNick}:</b> ${d.data().text}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  });
};

window.sendMessage = async function() {
  const input = document.getElementById("chatInput");
  if (!input.value || !currentChatUid) return;

  const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
  await addDoc(collection(db, "privateMessages", chatId, "messages"), {
    senderUid: auth.currentUser.uid,
    senderNick: auth.currentUser.email.split('@')[0],
    text: input.value,
    timestamp: serverTimestamp()
  });
  input.value = "";
};
