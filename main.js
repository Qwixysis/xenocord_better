import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ОКНА
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
window.showTab = (tabName) => {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.settings-tab').forEach(t => t.style.display = 'none');
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).style.display = 'block';
};

// ОБНОВЛЕНИЕ ПРОФИЛЯ
window.saveProfile = async () => {
    const user = auth.currentUser;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    const ava = document.getElementById('avaInput').value;
    await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
    alert("Сохранено!");
    closeModal('settingsModal');
};

// АВТОРИЗАЦИЯ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (d) {
            document.getElementById("userNick").innerText = d.nick || "Jarvis";
            document.getElementById("nickInput").value = d.nick || "";
            document.getElementById("bioInput").value = d.bio || "";
            document.getElementById("avaInput").value = d.ava || "";
            renderFriends(d);
            renderPending(d);
        }
    });
});

// ПРОСМОТР ДРУГА
window.viewFriend = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
        const d = snap.data();
        document.getElementById("friendProfileInfo").innerHTML = `
            <img src="${d.ava || ''}" class="avatar-preview" onerror="this.src='https://ui-avatars.com/api/?name=${d.nick}'">
            <h2>${d.nick || 'Без имени'}</h2>
            <p style="color:var(--text-muted); margin: 10px 0;">${d.bio || 'Нет описания'}</p>
            <div style="font-size:10px; background:var(--bg-dark); padding:5px; border-radius:5px;">UID: ${uid}</div>
        `;
        openModal('friendProfileModal');
    }
};

// ЧАТ И СООБЩЕНИЯ
async function sendMsg() {
    const input = document.getElementById('chatInput');
    const val = input.value.trim();
    if (!val || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: val,
        timestamp: serverTimestamp()
    });
    input.value = "";
}

async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
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
                const d = change.doc; const data = d.data();
                const isMe = data.senderUid === auth.currentUser.uid;
                let time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                const div = document.createElement("div");
                div.id = d.id; div.className = `msg ${isMe ? 'my' : ''}`;
                div.innerHTML = `<div class="msg-content">${data.text}</div><div class="msg-footer">${time}</div>
                    ${isMe ? `<div class="msg-actions">
                        <button onclick="window.editMsg('${d.id}', '${data.text}')">✎</button>
                        <button onclick="window.deleteMsg('${d.id}')">✕</button>
                    </div>` : ''}`;
                box.appendChild(div); box.scrollTop = box.scrollHeight;
            }
        });
    });
}

// РЕНДЕР СПИСКОВ
async function renderFriends(data) {
    const list = document.getElementById("friendsList"); list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid)); const fData = fSnap.data();
        const li = document.createElement("li");
        li.innerHTML = `<span>${fData?.nick || 'Друг'}</span>
            <div class="friend-actions">
                <button class="action-btn" onclick="event.stopPropagation(); viewFriend('${fUid}')">📋</button>
                <button class="action-btn del" onclick="event.stopPropagation(); deleteFriend('${fUid}')">✕</button>
            </div>`;
        li.onclick = () => openChat(fUid, fData?.nick);
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList"); list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button class="primary" style="padding:4px; font-size:10px;" onclick="acceptFriend('${pUid}')">OK</button>`;
        list.appendChild(li);
    }
}

// ГЛОБАЛЬНЫЕ ФУНКЦИИ
window.deleteFriend = async (uid) => { if(confirm("Удалить друга?")) await updateDoc(doc(db,"users",auth.currentUser.uid), {friends: arrayRemove(uid)}); };
window.acceptFriend = async (uid) => {
    await updateDoc(doc(db,"users",auth.currentUser.uid), {friends: arrayUnion(uid), pending: arrayRemove(uid)});
    await updateDoc(doc(db,"users",uid), {friends: arrayUnion(auth.currentUser.uid)});
};
window.logout = () => signOut(auth);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sendMsgBtn').onclick = sendMsg;
    document.getElementById('chatInput').onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };
    document.getElementById('copyUidBox').onclick = () => { navigator.clipboard.writeText(auth.currentUser.uid); alert("UID скопирован"); };
});
