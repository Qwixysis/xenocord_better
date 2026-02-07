import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("welcome").textContent = `Привет, ${user.displayName || user.email}!`;
    loadFriends(user.uid);
  }
});

// --- Модальное окно ---
window.openFriendModal = function() {
  document.getElementById("friendModal").style.display = "block";
};
window.closeFriendModal = function() {
  document.getElementById("friendModal").style.display = "none";
};

// --- Добавление друга ---
window.sendFriendRequest = async function() {
  const nick = document.getElementById("friendNick").value;
  const errorEl = document.getElementById("friendError");
  errorEl.textContent = "";

  if (!nick) return;

  // ищем пользователя по никнейму
  const usersRef = doc(db, "users", nick);
  const userSnap = await getDoc(usersRef);

  if (!userSnap.exists()) {
    errorEl.textContent = "Такого пользователя нет!";
    return;
  }

  const currentUser = auth.currentUser;
  await updateDoc(doc(db, "users", nick), {
    pending: arrayUnion(currentUser.displayName)
  });

  await updateDoc(doc(db, "users", currentUser.displayName), {
    requestsSent: arrayUnion(nick)
  });

  document.getElementById("pendingList").innerHTML += `<li>${nick} (ожидание)</li>`;
  closeFriendModal();
};

// --- Загрузка друзей ---
async function loadFriends(uid) {
  const userSnap = await getDoc(doc(db, "users", auth.currentUser.displayName));
  if (userSnap.exists()) {
    const data = userSnap.data();
    const friendsList = document.getElementById("friendsList");
    friendsList.innerHTML = "";
    (data.friends || []).forEach(f => {
      friendsList.innerHTML += `<li>${f}</li>`;
    });
    const pendingList = document.getElementById("pendingList");
    pendingList.innerHTML = "";
    (data.pending || []).forEach(p => {
      pendingList.innerHTML += `<li>${p} (ожидание)</li>`;
    });
  }
}

// --- Чат ---
window.sendMessage = function() {
  const msg = document.getElementById("chatInput").value;
  if (msg) {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML += `<p><b>${auth.currentUser.displayName}:</b> ${msg}</p>`;
    document.getElementById("chatInput").value = "";
  }
};

// --- Выход ---
window.logout = function() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};
