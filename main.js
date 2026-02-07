import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("welcome").textContent = `Привет, ${user.displayName || user.email}!`;
    loadFriends(user.displayName);
  }
});

window.openFriendModal = function() {
  document.getElementById("friendModal").style.display = "block";
};
window.closeFriendModal = function() {
  document.getElementById("friendModal").style.display = "none";
};
window.closeSuccessModal = function() {
  document.getElementById("successModal").style.display = "none";
};

window.sendFriendRequest = async function() {
  const nick = document.getElementById("friendNick").value;
  const errorEl = document.getElementById("friendError");
  errorEl.textContent = "";

  if (!nick) return;

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
  document.getElementById("successModal").style.display = "block";
};

window.acceptRequest = async function(nick) {
  const currentUser = auth.currentUser.displayName;

  await updateDoc(doc(db, "users", currentUser), {
    friends: arrayUnion(nick),
    pending: arrayRemove(nick)
  });

  await updateDoc(doc(db, "users", nick), {
    friends: arrayUnion(currentUser),
    requestsSent: arrayRemove(currentUser)
  });

  loadFriends(currentUser);
};

async function loadFriends(nick) {
  const userSnap = await getDoc(doc(db, "users", nick));
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
      pendingList.innerHTML += `<li>${p} <button onclick="acceptRequest('${p}')">Принять</button></li>`;
    });
  }
}

window.sendMessage = function() {
  const msg = document.getElementById("chatInput").value;
  if (msg) {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML += `<p><b>${auth.currentUser.displayName}:</b> ${msg}</p>`;
    document.getElementById("chatInput").value = "";
  }
};

window.logout = function() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};
