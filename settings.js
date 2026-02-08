import { auth } from "./firebase.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

// --- Обновить ник ---
export async function updateProfileNick(newNick) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uid), { nick: newNick });
  console.log("Ник обновлён:", newNick);
}

// --- Обновить фото ---
export async function updateProfilePhoto(photoURL) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uid), { photoURL });
  console.log("Фото обновлено");
}
