import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ФУНКЦИИ ГЛОБАЛЬНОГО ДОСТУПА
window.openModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

window.showTab = (tabId, btn) => {
    const tabs = document.querySelectorAll('.settings-tab');
    const navs = document.querySelectorAll('.nav-item');
    
    tabs.forEach(t => t.classList.remove('active'));
    navs.forEach(n => n.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (btn) btn.classList.add('active');
};

// СОХРАНЕНИЕ ПРОФИЛЯ
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    const ava = document.getElementById('avaInput').value;
    
    try {
        await updateDoc(doc(db, "users", user.uid), {
            nick: nick,
            bio: bio,
            ava: ava
        });
        alert("Профиль успешно сохранен!");
    } catch (e) {
        console.error("Ошибка сохранения:", e);
    }
};

// ПРОСМОТР ПРОФИЛЯ ДРУГА
window.viewFriend = async (uid) => {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const d = snap.data();
            const info = document.getElementById("friendProfileInfo");
            if (info) {
                info.innerHTML = `
                    <img src="${d.ava || ''}" class="avatar-preview" onerror="this.src='https://ui-avatars.com/api/?name=${d.nick}'">
                    <h2 style="margin-bottom:10px;">${d.nick || 'Пользователь'}</h2>
                    <p style="color:var(--text-muted); margin-bottom:15px;">${d.bio || 'Описание отсутствует'}</p>
                    <div style="font-size:10px; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">UID: ${uid}</div>
                `;
                window.openModal('friendProfileModal');
            }
        }
    } catch (e) {
        console.error("Ошибка при просмотре друга:", e);
    }
};

// УДАЛЕНИЕ СООБЩЕНИЯ
window.deleteMsg = async (id) => {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    try {
        await deleteDoc(doc(db, "privateMessages", chatId, "messages", id));
    } catch (e) {
        console.error("Ошибка удаления:", e);
    }
};

// УДАЛЕНИЕ ДРУГА
window.deleteFriend = async (uid) => {
    if (confirm("Вы уверены, что хотите удалить этого друга?")) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(uid) });
    }
};

// ПРИНЯТИЕ ЗАЯВКИ
window.acceptFriend = async (uid) => {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        friends: arrayUnion(uid),
        pending: arrayRemove(uid)
    });
    await updateDoc(doc(db, "users", uid), {
        friends: arrayUnion(auth.currentUser.uid)
    });
};

// ОТПРАВКА СООБЩЕНИЯ
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

// ОТКРЫТИЕ ЧАТА
async function openChat(fUid, nick) {
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
                
                let timeStr = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                
                div.innerHTML = `
                    <div class="msg-content">${d.text}</div>
                    <div class="msg-footer">${timeStr}</div>
                    ${isMe ? `<div class="msg-actions"><button onclick="window.deleteMsg('${change.doc.id}')">✕</button></div>` : ''}
                `;
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            }
        });
    });
}

// РЕНДЕР СПИСКОВ
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    if (!list) return;
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const fData = fSnap.data();
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${fData?.nick || 'Друг'}</span>
            <div class="friend-actions">
                <button onclick="event.stopPropagation(); window.viewFriend('${fUid}')" style="background:none; color:white; border:none; cursor:pointer; font-size:16px;">📋</button>
                <button onclick="event.stopPropagation(); window.deleteFriend('${fUid}')" style="background:none; color:var(--danger); border:none; cursor:pointer; font-size:16px; margin-left:10px;">✕</button>
            </div>`;
        li.onclick = () => openChat(fUid, fData?.nick);
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
        li.innerHTML = `
            <span>${pSnap.data()?.nick}</span>
            <button class="btn-primary" style="padding:4px 8px; width:auto;" onclick="window.acceptFriend('${pUid}')">OK</button>
        `;
        list.appendChild(li);
    }
}

// ПРОВЕРКА ВХОДА
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const uidDisplay = document.getElementById("userUid");
    if (uidDisplay) uidDisplay.innerText = user.uid;

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

// ЗАГРУЗКА DOM
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.onclick = sendMsg;

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };
    }

    const copyBtn = document.getElementById('copyUidBox');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const uid = document.getElementById('userUid').innerText;
            navigator.clipboard.writeText(uid);
            alert("UID скопирован!");
        };
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth);
    }
    
    // ДОБАВЛЕНИЕ ДРУГА
    window.sendFriendRequest = async () => {
        const input = document.getElementById('friendUidInput');
        const uid = input.value.trim();
        if (uid) {
            try {
                await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
                alert("Запрос отправлен!");
                window.closeModal('addFriendModal');
            } catch (e) {
                alert("Ошибка: проверьте правильность UID");
            }
        }
    };
});
