import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// Делаем функции глобальными для HTML
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.showTab = (tabName) => {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.settings-tab').forEach(t => t.style.display = 'none');
    
    const activeTab = document.getElementById(tabName);
    const activeMenu = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    
    if (activeTab) activeTab.style.display = 'block';
    if (activeMenu) activeMenu.classList.add('active');
};

// АВТОРИЗАЦИЯ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const uidEl = document.getElementById("userUid");
    if (uidEl) uidEl.innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (d) {
            const nickEl = document.getElementById("userNick");
            if (nickEl) nickEl.innerText = d.nick || "Jarvis";
            
            // Заполняем поля в настройках, если они есть
            if (document.getElementById('nickInput')) document.getElementById('nickInput').value = d.nick || "";
            if (document.getElementById('bioInput')) document.getElementById('bioInput').value = d.bio || "";
            if (document.getElementById('avaInput')) document.getElementById('avaInput').value = d.ava || "";
            
            renderFriends(d);
            renderPending(d);
        }
    });
});

// ПРОФИЛЬ
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nick = document.getElementById('nickInput')?.value;
    const bio = document.getElementById('bioInput')?.value;
    const ava = document.getElementById('avaInput')?.value;
    
    await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
    alert("Профиль обновлен!");
    window.closeModal('settingsModal');
};

window.viewFriend = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
        const d = snap.data();
        const infoBox = document.getElementById("friendProfileInfo");
        if (infoBox) {
            infoBox.innerHTML = `
                <img src="${d.ava || ''}" class="avatar-preview" onerror="this.src='https://ui-avatars.com/api/?name=${d.nick}'">
                <h2>${d.nick || 'Друг'}</h2>
                <p style="color:var(--text-muted); margin: 10px 0;">${d.bio || 'Нет описания'}</p>
                <div style="font-size:10px; background:var(--bg-dark); padding:5px; border-radius:5px;">UID: ${uid}</div>
            `;
            window.openModal('friendProfileModal');
        }
    }
};

// ЧАТ
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

window.openChat = async (fUid, nick) => {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    
    const titleEl = document.getElementById("chatTitle");
    if (titleEl) titleEl.innerText = nick;

    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });
        
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const d = change.doc;
                const data = d.data();
                const isMe = data.senderUid === auth.currentUser.uid;
                
                let time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                
                const div = document.createElement("div");
                div.id = d.id;
                div.className = `msg ${isMe ? 'my' : ''}`;
                div.innerHTML = `
                    <div class="msg-content">${data.text}</div>
                    <div class="msg-footer">${time}</div>
                    ${isMe ? `<div class="msg-actions">
                        <button onclick="window.deleteMsg('${d.id}')">✕</button>
                    </div>` : ''}
                `;
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            }
        });
    });
};

// СПИСКИ
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
                <button class="action-btn" onclick="event.stopPropagation(); window.viewFriend('${fUid}')">📋</button>
                <button class="action-btn del" onclick="event.stopPropagation(); window.deleteFriend('${fUid}')">✕</button>
            </div>`;
        li.onclick = () => window.openChat(fUid, fData?.nick);
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
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button class="primary" style="padding:4px 8px; font-size:10px;" onclick="window.acceptFriend('${pUid}')">OK</button>`;
        list.appendChild(li);
    }
}

// ДЕЙСТВИЯ
window.deleteFriend = async (uid) => { if(confirm("Удалить друга?")) await updateDoc(doc(db,"users",auth.currentUser.uid), {friends: arrayRemove(uid)}); };
window.acceptFriend = async (uid) => {
    await updateDoc(doc(db,"users",auth.currentUser.uid), {friends: arrayUnion(uid), pending: arrayRemove(uid)});
    await updateDoc(doc(db,"users",uid), {friends: arrayUnion(auth.currentUser.uid)});
};
window.deleteMsg = async (id) => {
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", id));
};
window.logout = () => signOut(auth);

// ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.onclick = sendMsg;

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };
    }

    const copyBox = document.getElementById('copyUidBox');
    if (copyBox) {
        copyBox.onclick = () => {
            const uid = document.getElementById('userUid').innerText;
            navigator.clipboard.writeText(uid);
            alert("UID скопирован");
        };
    }
    
    window.sendFriendRequest = async () => {
        const u = document.getElementById('friendUidInput').value.trim();
        if (u) {
            try {
                await updateDoc(doc(db, "users", u), { pending: arrayUnion(auth.currentUser.uid) });
                alert("Запрос отправлен!");
                window.closeModal('addFriendModal');
            } catch(e) { alert("UID не найден"); }
        }
    };
});
