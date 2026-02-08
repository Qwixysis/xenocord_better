import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis";
        document.getElementById("userUid").innerText = user.uid;
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0];
        document.getElementById("pAvatar").innerText = (d.nick || "J")[0];
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("logoutBtn").onclick = () => signOut(auth);
});
