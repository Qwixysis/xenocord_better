import { auth } from "./firebase.js";
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

// --- Добавить друга ---
export async function sendFriendRequest(friendUid) {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const userSnap = await getDoc(doc(db, "users", friendUid));
  if (!userSnap.exists()) {
    console.error("Такого пользователя нет!");
    return;
  }

  await updateDoc(doc(db, "users", friendUid), {
    pending: arrayUnion(currentUser.uid)
  });

  await updateDoc(doc(db, "users", currentUser.uid), {
    requestsSent: arrayUnion(friendUid)
  });
}

// --- Принять запрос ---
export async function acceptRequest(friendUid) {
  const currentUid = auth.currentUser.uid;

  await updateDoc(doc(db, "users", currentUid), {
    friends: arrayUnion(friendUid),
    pending: arrayRemove(friendUid)
  });

  await updateDoc(doc(db, "users", friendUid), {
    friends: arrayUnion(currentUid),
    requestsSent: arrayRemove(currentUid)
  });
}

// --- Удалить друга ---
export async function removeFriend(friendUid) {
  const currentUid = auth.currentUser.uid;

  await updateDoc(doc(db, "users", currentUid), {
    friends: arrayRemove(friendUid)
  });

  await updateDoc(doc(db, "users", friendUid), {
    friends: arrayRemove(currentUid)
  });

  console.log("Друг удалён:", friendUid);
}
