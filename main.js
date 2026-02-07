import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    document.getElementById("welcome").textContent = `Привет, ${user.displayName || user.email}! (UID: ${user.uid})`;
    loadFriends(user.uid);
  }
});

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

  document.getElementById("pendingList").innerHTML += `<li>${friendUid} (ожидание)</li>`;
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

window.logout = function() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
};
