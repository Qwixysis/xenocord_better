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

/* ============================================================
   ГЛОБАЛЬНЫЙ ЭКСПОРТ (Чтобы onclick в HTML работал)
   ============================================================ */

// Сохранение профиля
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
        console.error("Ошибка сохранения профиля:", error);
    }
};

// Управление модальными окнами
window.openModal = function(id) {
    document.getElementById(id)?.classList.add('active');
};

window.closeModal = function(id) {
    document.getElementById(id)?.classList.remove('active');
};

// Переключение вкладок
window.showTab = function(tabId, btn) {
    const tabs = document.querySelectorAll('.settings-tab');
    const navItems = document.querySelectorAll('.nav-item');
    
    tabs.forEach(t => t.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    document.getElementById(tabId)?.classList.add('active');
    btn?.classList.add('active');
};

// Друзья и профили
window.viewProfile = async function(fUid) {
    try {
        const snap = await getDoc(doc(db, "users", fUid));
        if (snap.exists()) {
            const data = snap.data();
            alert(`Карточка пользователя:\nНик: ${data.nick || 'Не указан'}\nО себе: ${data.bio || 'Пусто'}`);
        }
    } catch (e) { console.error(e); }
};

window.removeFromFriends = async function(fUid) {
    if(!confirm("Удалить из друзей?")) return;
    const myUid = auth.currentUser?.uid;
    if(!myUid) return;
    try {
        await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
        await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
    } catch (e) { console.error(e); }
};

window.sendFriendRequest = async function() {
    const input = document.getElementById('friendUidInput');
    const targetUid = input?.value.trim();
    if (!targetUid || targetUid === auth.currentUser?.uid) return;

    try {
        await updateDoc(doc(db, "users", targetUid), {
            pending: arrayUnion(auth.currentUser.uid)
        });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (e) { alert("Пользователь не найден!"); }
};

window.acceptFriend = async function(uid) {
    const myUid = auth.currentUser?.uid;
    if(!myUid) return;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

// Сообщения
window.deleteMessage = async function(msgId) {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
};

window.startEdit = function(msgId, oldText) {
    editMode = { active: true, msgId: msgId };
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = oldText;
        input.focus();
        input.style.border = "2px solid var(--accent)";
    }
};

/* ============================================================
   ЛОГИКА ЧАТА И СТАТУСОВ
   ============================================================ */

let typingTimeout;
function setTypingStatus(isTyping) {
    if (!currentChatUid || !auth.currentUser) return;
    const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
    setDoc(typingRef, { isTyping: isTyping, lastUpdate: serverTimestamp() }, { merge: true });
}

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
        input.style.border = "none";
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

window.openChat = function(fUid, nick) {
    currentChatUid = fUid;
    const title = document.getElementById("chatTitle");
    if (title) title.innerText = nick;

    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        if(!box) return;
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

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const uidDisplay = document.getElementById("userUid");
    if (uidDisplay) uidDisplay.innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;

        const nickDisp = document.getElementById("userNick");
        if (nickDisp) nickDisp.innerText = d.nick || "Jarvis";

        // Заполняем поля в настройках, если они есть
        const nI = document.getElementById('nickInput');
        const bI = document.getElementById('bioInput');
        const aI = document.getElementById('avaInput');
        if (nI) nI.value = d.nick || "";
        if (bI) bI.value = d.bio || "";
        if (aI) aI.value = d.ava || "";

        // Друзья
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
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (input) {
        input.addEventListener('input', () => {
            setTypingStatus(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => setTypingStatus(false), 3000);
        });
        input.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
    }
    if (sendBtn) sendBtn.onclick = handleSend;
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth);
});
