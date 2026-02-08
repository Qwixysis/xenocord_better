import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- ОКНА И ТАБЫ ---
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');
};

// --- ПРОФИЛЬ ---
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    const ava = document.getElementById('avaInput').value;
    try {
        await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
        alert("Профиль обновлен!");
    } catch (e) { console.error(e); }
};

window.viewFriend = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
        const d = snap.data();
        const info = document.getElementById("friendProfileInfo");
        info.innerHTML = `
            <img src="${d.ava || ''}" class="avatar-preview" onerror="this.src='https://ui-avatars.com/api/?name=${d.nick}'">
            <h2>${d.nick || 'Юзер'}</h2>
            <p style="color:var(--text-muted); margin: 10px 0;">${d.bio || 'Нет описания'}</p>
            <small style="opacity:0.5;">UID: ${uid}</small>
        `;
        window.openModal('friendProfileModal');
    }
};

// --- ДРУЗЬЯ ---
window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const targetUid = input.value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) return;
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

window.deleteFriend = async (uid) => {
    if (confirm("Удалить друга?")) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(uid) });
    }
};

// --- ЧАТ ---
async function sendMsg() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: text,
        timestamp: serverTimestamp()
    });
    input.value = "";
}

window.deleteMsg = async (id) => {
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", id));
};

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const box = document.getElementById("chatBox");
    box.innerHTML = "";
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const d = change.doc.data();
                const isMe = d.senderUid === auth.currentUser.uid;
                const div = document.createElement("div");
                div.id = change.doc.id;
                div.className = `msg ${isMe ? 'my' : ''}`;
                let time = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "Только что";
                div.innerHTML = `<div>${d.text}</div><div class="msg-footer">${time}</div>
                ${isMe ? `<div class="msg-actions"><button onclick="window.deleteMsg('${change.doc.id}')">✕</button></div>` : ''}`;
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            }
        });
    });
};

// --- РЕНДЕР ---
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const fData = fSnap.data();
        const li = document.createElement("li");
        li.innerHTML = `<span>${fData?.nick || 'Друг'}</span>
            <div class="friend-actions"><button onclick="event.stopPropagation(); window.viewFriend('${fUid}')">📋</button></div>`;
        li.onclick = () => window.openChat(fUid, fData?.nick);
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button onclick="window.acceptFriend('${pUid}')" style="background:var(--accent); color:white; padding:2px 5px; border-radius:3px; margin-left:10px; cursor:pointer;">OK</button>`;
        list.appendChild(li);
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (d) {
            document.getElementById("userNick").innerText = d.nick || "Jarvis";
            document.getElementById('nickInput').value = d.nick || "";
            document.getElementById('bioInput').value = d.bio || "";
            document.getElementById('avaInput').value = d.ava || "";
            renderFriends(d);
            renderPending(d);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sendMsgBtn').onclick = sendMsg;
    document.getElementById('chatInput').onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };
    document.getElementById('logoutBtn').onclick = () => signOut(auth);
});
