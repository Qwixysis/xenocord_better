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
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        const uidEl = document.getElementById("userUid");
        if (uidEl) uidEl.innerText = user.uid;
        
        // Живое обновление профиля
        onSnapshot(doc(db, "users", user.uid), (snap) => {
            const data = snap.data();
            if (data) {
                const nickEl = document.getElementById("userNick");
                if (nickEl) nickEl.innerText = data.nick || "Юзер";
                renderFriends(data);
            }
        });
    }
});

// --- Глобальные функции (видны в HTML) ---
window.openModal = (id) => {
    const m = document.getElementById(id);
    if (m) {
        m.style.display = 'flex';
        if (id === 'profileModal') {
            document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        }
    }
};

window.closeModal = (id) => {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
};

window.copyUid = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid).then(() => alert("UID скопирован!"));
};

window.logout = () => signOut(auth);

window.saveProfile = async () => {
    const newNick = document.getElementById('editNickInput').value.trim();
    if (!newNick) return;
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), { nick: newNick });
        window.closeModal('profileModal');
    } catch (e) { console.error(e); }
};

window.sendFriendRequest = async () => {
    const input = document.getElementById("friendUidInput");
    const fUid = input.value.trim();
    if (!fUid || fUid === auth.currentUser.uid) return alert("Неверный UID");
    try {
        await updateDoc(doc(db, "users", fUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('friendModal');
    } catch (e) { alert("Пользователь не найден"); }
};

// --- Друзья и Чат ---
async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    if (!fList || !pList) return;

    fList.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        fList.appendChild(li);
    }

    pList.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-ok" onclick="event.stopPropagation(); acceptFriend('${pUid}')">OK</button>`;
        pList.appendChild(li);
    }
}

window.acceptFriend = async (fUid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
};

async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatHeader").innerText = "Чат: " + nick;
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = snap.docs.map(d => `
            <div class="msg ${d.data().senderUid === auth.currentUser.uid ? 'my' : ''}">
                ${d.data().text}
            </div>
        `).join("");
        box.scrollTop = box.scrollHeight;
    });
}

window.sendMessage = async () => {
    const input = document.getElementById("chatInput");
    if (!input.value || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
};
