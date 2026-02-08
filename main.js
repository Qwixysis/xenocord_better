import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Состояние пользователя ---
onAuthStateChanged(auth, async user => {
  if (!user) {
    if (window.location.pathname.includes("app.html")) {
      window.location.href = "index.html";
    }
  } else {
    const nickEl = document.getElementById("userNick");
    const uidEl = document.getElementById("userUid");
    if (nickEl) nickEl.textContent = user.email.split('@')[0];
    if (uidEl) uidEl.textContent = user.uid;
    loadFriends(user.uid);
  }
});

// --- Функции для кнопок (привязываем к window) ---

window.openFriendModal = function() {
  document.getElementById("friendModal").style.display = "block";
};

window.closeFriendModal = function() {
  document.getElementById("friendModal").style.display = "none";
};

window.logout = function() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};

window.sendFriendRequest = async function() {
  const friendUid = document.getElementById("friendUidInput").value.trim();
  const currentUser = auth.currentUser;
  
  if (!friendUid || friendUid === currentUser.uid) {
    alert("Введите корректный UID");
    return;
  }

  try {
    const friendRef = doc(db, "users", friendUid);
    const friendSnap = await getDoc(friendRef);
    
    if (!friendSnap.exists()) {
      alert("Пользователь не найден!");
      return;
    }

    await updateDoc(friendRef, { pending: arrayUnion(currentUser.uid) });
    alert("Запрос отправлен!");
    closeFriendModal();
  } catch (e) {
    console.error(e);
    alert("Ошибка при отправке запроса");
  }
};

window.acceptRequest = async function(friendUid) {
  const myUid = auth.currentUser.uid;
  try {
    // Добавляем друг другу в список друзей
    await updateDoc(doc(db, "users", myUid), {
      friends: arrayUnion(friendUid),
      pending: arrayRemove(friendUid)
    });
    await updateDoc(doc(db, "users", friendUid), {
      friends: arrayUnion(myUid)
    });
  } catch (e) {
    console.error(e);
  }
};

window.removeFriend = async function(friendUid) {
  const myUid = auth.currentUser.uid;
  if (!confirm("Удалить из друзей?")) return;
  
  await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(friendUid) });
  await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(myUid) });
};

// --- Чат и загрузка данных ---

function loadFriends(uid) {
  onSnapshot(doc(db, "users", uid), async (snap) => {
    const data = snap.data();
    if (!data) return;

    // Список друзей
    const list = document.getElementById("friendsList");
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
      const fSnap = await getDoc(doc(db, "users", fUid));
      const fData = fSnap.data();
      list.innerHTML += `
        <li class="friend-item">
          <span>${fData?.nick || 'Друг'}</span>
          <button onclick="openChatWithFriend('${fUid}')">Чат</button>
          <button onclick="removeFriend('${fUid}')" style="background:#cc3333">×</button>
        </li>`;
    }

    // Список входящих заявок
    const pList = document.getElementById("pendingList");
    pList.innerHTML = "";
    for (const pUid of (data.pending || [])) {
      const pSnap = await getDoc(doc(db, "users", pUid));
      const pData = pSnap.data();
      pList.innerHTML += `
        <li class="pending-item">
          <span>${pData?.nick || 'Заявка'}</span>
          <button onclick="acceptRequest('${pUid}')">Принять</button>
        </li>`;
    }
  });
}

window.openChatWithFriend = function(fUid) {
  currentChatUid = fUid;
  const chatId = [auth.currentUser.uid, fUid].sort().join("_");
  document.getElementById("chatHeader").textContent = `Чат с ${fUid.substring(0,8)}...`;
  
  if (unsubscribeChat) unsubscribeChat();
  
  const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
  unsubscribeChat = onSnapshot(q, (snap) => {
    const box = document.getElementById("chatBox");
    box.innerHTML = snap.docs.map(d => `
      <div class="msg">
        <small>${d.data().senderNick}</small>
        <div>${d.data().text}</div>
      </div>
    `).join("");
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
