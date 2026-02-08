import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ФИКС: Делаем функции глобальными для HTML onclick
window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');
};

// Профиль
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nick = document.getElementById('nickInput')?.value;
    const bio = document.getElementById('bioInput')?.value;
    const ava = document.getElementById('avaInput')?.value;
    await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
    alert("Данные сохранены!");
};

// Чат
async function sendMsg() {
    const input = document.getElementById('chatInput');
    const val = input?.value.trim();
    if (!val || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: val,
        timestamp: serverTimestamp()
    });
    input.value = "";
}

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    const title = document.getElementById("chatTitle");
    if (title) title.innerText = nick;
    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "added" && box) {
                const d = change.doc.data();
                const isMe = d.senderUid === auth.currentUser.uid;
                const div = document.createElement("div");
                div.className = `msg ${isMe ? 'my' : ''}`;
                let time = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..";
                div.innerHTML = `<div>${d.text}</div><div class="msg-footer">${time}</div>`;
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            }
        });
    });
};

// Друзья
window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const targetUid = input?.value.trim();
    if (!targetUid) return;
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (e) { alert("Ошибка UID"); }
};

window.acceptFriend = async (uid) => {
    await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(auth.currentUser.uid) });
};

// Рендеры
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    if (!list) return;
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span>`;
        li.onclick = () => window.openChat(fUid, fSnap.data()?.nick);
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    if (!list) return;
    list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.style.justifyContent = "space-between";
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button onclick="window.acceptFriend('${pUid}')" style="background:var(--accent); border:none; color:white; padding:2px 5px; border-radius:3px;">OK</button>`;
        list.appendChild(li);
    }
}

// Слушатель состояния
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const uidBox = document.getElementById("userUid");
    if (uidBox) uidBox.innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (d) {
            const nickBox = document.getElementById("userNick");
            if (nickBox) nickBox.innerText = d.nick || "Jarvis";
            renderFriends(d);
            renderPending(d);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMsg);
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => { if(e.key === 'Enter') sendMsg(); });
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
});
