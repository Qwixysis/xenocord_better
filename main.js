import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Авторизация ---
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("welcome").textContent = 
      `Привет, ${user.displayName || user.email}! (UID: ${user.uid})`;
    loadFriends(user.uid);
  }
});

// --- Друзья ---
window.openFriendModal = function() {
  document.getElementById("friendModal").style.display = "block";
};
window.closeFriendModal = function() {
  document.getElementById("friendModal").style.display = "none";
};

window.sendFriendRequest = async function() {
  const friendUid = document.getElementById("friendUid").value.trim();
  const errorEl = document.getElementById("friendError");
  errorEl.textContent = "";

  if (!friendUid) return;

  const usersRef = doc(db, "users", friendUid);
  const userSnap = await getDoc(usersRef);

  if (!userSnap.exists()) {
    errorEl.textContent = "Такого пользователя нет!";
    return;
  }

  const currentUser = auth.currentUser;

  await updateDoc(doc(db, "users", friendUid), {
    pending: arrayUnion(currentUser.uid)
  });

  await updateDoc(doc(db, "users", currentUser.uid), {
    requestsSent: arrayUnion(friendUid)
  });

  closeFriendModal();
};

window.acceptRequest = async function(friendUid) {
  const currentUid = auth.currentUser.uid;

  await updateDoc(doc(db, "users", currentUid), {
    friends: arrayUnion(friendUid),
    pending: arrayRemove(friendUid)
  });

  await updateDoc(doc(db, "users", friendUid), {
    friends: arrayUnion(currentUid),
    requestsSent: arrayRemove(currentUid)
  });

  loadFriends(currentUid);
};

async function loadFriends(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    const data = userSnap.data();

    const friendsList = document.getElementById("friendsList");
    friendsList.innerHTML = "";
    (data.friends || []).forEach(async f => {
      const friendSnap = await getDoc(doc(db, "users", f));
      if (friendSnap.exists()) {
        const friendData = friendSnap.data();
        friendsList.innerHTML += `<li>
          <img src="${friendData.photoURL || 'default.png'}" width="30" height="30">
          ${friendData.nick} 
          <button onclick="openChatWithFriend('${f}')">Чат</button>
          <button onclick="viewFriendProfile('${f}')">Профиль</button>
        </li>`;
      }
    });

    const pendingList = document.getElementById("pendingList");
    pendingList.innerHTML = "";
    (data.pending || []).forEach(async p => {
      const pendingSnap = await getDoc(doc(db, "users", p));
      if (pendingSnap.exists()) {
        const pendingData = pendingSnap.data();
        pendingList.innerHTML += `<li>
          <img src="${pendingData.photoURL || 'default.png'}" width="30" height="30">
          ${pendingData.nick} 
          <button onclick="acceptRequest('${p}')">Принять</button>
          <button onclick="viewFriendProfile('${p}')">Профиль</button>
        </li>`;
      }
    });
  }
}

// --- Просмотр профиля друга (только просмотр) ---
window.viewFriendProfile = async function(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    const data = snap.data();
    document.getElementById("friendProfileUid").textContent = data.uid;
    document.getElementById("friendProfileEmail").textContent = data.email;
    document.getElementById("friendProfileNick").textContent = data.nick;
    document.getElementById("friendProfilePhoto").src = data.photoURL || "default.png";
    document.getElementById("friendProfileModal").style.display = "block";
  }
};

window.closeFriendProfileModal = function() {
  document.getElementById("friendProfileModal").style.display = "none";
};

// --- Чат с другом ---
window.openChatWithFriend = function(friendUid) {
  currentChatUid = friendUid;
  if (unsubscribeChat) unsubscribeChat();
  subscribeToChat(friendUid);
};

async function sendMessageToFriend(friendUid, text) {
  const user = auth.currentUser;
  const chatId = [user.uid, friendUid].sort().join("_");

  await addDoc(collection(db, "privateMessages", chatId, "messages"), {
    senderUid: user.uid,
    senderNick: user.displayName || user.email,
    text: text,
    timestamp: serverTimestamp()
  });
}

window.sendMessage = async function() {
  const chatInput = document.getElementById("chatInput");
  const msg = chatInput.value.trim();
  if (!msg || !currentChatUid) return;
  await sendMessageToFriend(currentChatUid, msg);
  chatInput.value = "";
};

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
      chatBox.innerHTML += `<p><b>${data.senderNick}:</b> ${data.text}</p>`;
    });
  });
}

// --- Выход ---
window.logout = function() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};
