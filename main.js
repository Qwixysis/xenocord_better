import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;
let editMode = { active: false, msgId: null };

// --- ЖЕСТКАЯ ПРИВЯЗКА К WINDOW (ЧТОБЫ НЕ БЫЛО ОШИБОК IS NOT A FUNCTION) ---
window.saveProfile = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const nick = document.getElementById('nickInput')?.value.trim();
    const bio = document.getElementById('bioInput')?.value.trim();
    const ava = document.getElementById('avaInput')?.value.trim();

    try {
        await updateDoc(doc(db, "users", user.uid), {
            nick: nick || "",
            bio: bio || "",
            ava: ava || ""
        });
        alert("Профиль успешно обновлен!");
    } catch (error) {
        console.error("Ошибка сохранения:", error);
    }
};

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.showTab = (tabId, btn) => {
    const tabs = document.querySelectorAll('.settings-tab');
    const navItems = document.querySelectorAll('.nav-item');
    tabs.forEach(t => t.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    document.getElementById(tabId)?.classList.add('active');
    btn?.classList.add('active');
};

// --- СИСТЕМА ПЕЧАТАНИЯ ---
let typingTimeout;
function setTypingStatus(isTyping) {
    if (!currentChatUid || !auth.currentUser) return;
    const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
    setDoc(typingRef, { isTyping: isTyping, lastUpdate: serverTimestamp() }, { merge: true });
}

// --- УПРАВЛЕНИЕ ДРУЗЬЯМИ ---
window.removeFromFriends = async (fUid) => {
    if(!confirm("Удалить пользователя из друзей?")) return;
    const myUid = auth.currentUser.uid;
    try {
        await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
        await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
    } catch (e) { console.error(e); }
};

window.viewProfile = async (fUid) => {
    const snap = await getDoc(doc(db, "users", fUid));
    if (snap.exists()) {
        const d = snap.data();
        alert(`ИНФО:\nНик: ${d.nick || 'Не указан'}\nО себе: ${d.bio || '...'}\nUID: ${fUid}`);
    }
};

window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const uid = input?.value.trim();
    if (!uid || uid === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (e) { alert("Ошибка: UID не найден"); }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

// --- СООБЩЕНИЯ ---
window.deleteMessage = async (msgId) => {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
};

window.startEdit = (msgId, oldText) => {
    editMode = { active: true, msgId: msgId };
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = oldText;
        input.focus();
        input.style.boxShadow = "0 0 10px var(--accent)";
    }
};

async function handleSend() {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");

    if (editMode.active) {
        await updateDoc(doc(db, "privateMessages", chatId, "messages", editMode.msgId), {
            text: text,
            isEdited: true
        });
        editMode = { active: false, msgId: null };
        input.style.boxShadow = "none";
    } else {
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    }
    input.value = "";
    setTypingStatus(false);
}

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    const title = document.getElementById("chatTitle");
    if (title) title.innerText = nick;
    
    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = `<div style="text-align:center; padding:20px; opacity:0.5;">Загрузка истории...</div>`;

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        if (!box) return;
        box.innerHTML = "";
        snap.docs.forEach(docSnap => {
            const d = docSnap.data();
            const isMe = d.senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : ''}`;
            const time = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..";
            
            div.innerHTML = `
                ${isMe ? `<div class="msg-actions">
                    <button onclick="window.startEdit('${docSnap.id}', '${d.text.replace(/'/g, "\\'")}')">✏️</button>
                    <button onclick="window.deleteMessage('${docSnap.id}')">❌</button>
                </div>` : ''}
                <div class="msg-content">${d.text}</div>
                <div class="msg-footer">${d.isEdited ? '(ред.) ' : ''}${time}</div>
            `;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });

    onSnapshot(doc(db, "typing", `${auth.currentUser.uid}_${fUid}`), (s) => {
        const tStatus = document.getElementById("typingStatus");
        if (tStatus) tStatus.innerText = (s.exists() && s.data().isTyping) ? "печатает..." : "";
    });
};

// --- ИНИЦИАЛИЗАЦИЯ ПРИ ВХОДЕ ---
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const uidDisplay = document.getElementById("userUid");
    if (uidDisplay) uidDisplay.innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;

        const nickDisplay = document.getElementById("userNick");
        if (nickDisplay) nickDisplay.innerText = d.nick || "Jarvis";
        
        // Предзаполнение полей настроек
        const nInp = document.getElementById('nickInput');
        const bInp = document.getElementById('bioInput');
        const aInp = document.getElementById('avaInput');
        if (nInp) nInp.value = d.nick || "";
        if (bInp) bInp.value = d.bio || "";
        if (aInp) aInp.value = d.ava || "";

        // Рендер друзей
        const fList = document.getElementById("friendsList");
        if (fList) {
            fList.innerHTML = "";
            (d.friends || []).forEach(async fUid => {
                const fSnap = await getDoc(doc(db, "users", fUid));
                const fData = fSnap.data();
                const li = document.createElement("li");
                li.innerHTML = `
                    <span>${fData?.nick || 'Друг'}</span>
                    <div class="friend-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); window.viewProfile('${fUid}')">📋</button>
                        <button class="action-btn del" onclick="event.stopPropagation(); window.removeFromFriends('${fUid}')">✕</button>
                    </div>
                `;
                li.onclick = () => window.openChat(fUid, fData?.nick || 'Друг');
                fList.appendChild(li);
            });
        }

        // Рендер заявок
        const pList = document.getElementById("pendingList");
        if (pList) {
            pList.innerHTML = "";
            (d.pending || []).forEach(async pUid => {
                const pSnap = await getDoc(doc(db, "users", pUid));
                const li = document.createElement("li");
                li.innerHTML = `
                    <span>${pSnap.data()?.nick || 'Заявка'}</span>
                    <button class="btn-primary" onclick="window.acceptFriend('${pUid}')" style="padding:2px 8px; font-size:10px;">OK</button>
                `;
                pList.appendChild(li);
            });
        }
    });
});

// События
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (input) {
        input.addEventListener('input', () => {
            setTypingStatus(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => setTypingStatus(false), 2000);
        });
        input.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
    }
    
    if (sendBtn) sendBtn.onclick = handleSend;
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth);
});
