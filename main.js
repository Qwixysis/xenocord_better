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

// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ ---
window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    btn?.classList.add('active');
};

// --- СТАТУС ПЕЧАТАНИЯ ---
let typingTimeout;
function setTypingStatus(isTyping) {
    if (!currentChatUid) return;
    const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
    setDoc(typingRef, { isTyping: isTyping, lastUpdate: serverTimestamp() }, { merge: true });
}

// --- УДАЛЕНИЕ ИЗ ДРУЗЕЙ ---
window.removeFromFriends = async (fUid) => {
    if(!confirm("Удалить из друзей?")) return;
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
    alert("Удален.");
};

// --- ПРОСМОТР АККАУНТА ---
window.viewProfile = async (fUid) => {
    const snap = await getDoc(doc(db, "users", fUid));
    if (snap.exists()) {
        const data = snap.data();
        alert(`Ник: ${data.nick}\nО себе: ${data.bio || "Пусто"}\nUID: ${fUid}`);
    }
};

// --- СООБЩЕНИЯ: УДАЛЕНИЕ И РЕДАКТ ---
window.deleteMessage = async (msgId) => {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
};

window.startEdit = (msgId, oldText) => {
    editMode = { active: true, msgId: msgId };
    const input = document.getElementById('chatInput');
    input.value = oldText;
    input.style.border = "1px solid var(--accent)";
    input.focus();
};

async function handleSend() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");

    if (editMode.active) {
        // Редактирование
        await updateDoc(doc(db, "privateMessages", chatId, "messages", editMode.msgId), {
            text: text,
            isEdited: true
        });
        editMode = { active: false, msgId: null };
        input.style.border = "none";
    } else {
        // Обычная отправка
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    }
    input.value = "";
    setTypingStatus(false);
}

// --- ОТКРЫТИЕ ЧАТА ---
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const box = document.getElementById("chatBox");
    box.innerHTML = "";

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    // Слушаем сообщения
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(docSnap => {
            const d = docSnap.data();
            const isMe = d.senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : ''}`;
            
            const time = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..";
            
            let actions = isMe ? `
                <div class="msg-actions">
                    <button onclick="window.startEdit('${docSnap.id}', '${d.text}')">✏️</button>
                    <button onclick="window.deleteMessage('${docSnap.id}')">❌</button>
                </div>` : "";

            div.innerHTML = `
                ${actions}
                <div>${d.text}</div>
                <div class="msg-footer">
                    ${d.isEdited ? '<span class="is-edited">(ред.)</span>' : ''} ${time}
                </div>
            `;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });

    // Слушаем статус печатания собеседника
    onSnapshot(doc(db, "typing", `${auth.currentUser.uid}_${fUid}`), (s) => {
        const tStatus = document.getElementById("typingStatus");
        if (s.exists() && s.data().isTyping) {
            tStatus.innerText = "печатает...";
        } else {
            tStatus.innerText = "";
        }
    });
};

// --- СЛУШАТЕЛИ ВХОДА ---
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis";
        
        // Рендер друзей
        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (d.friends || []).forEach(async uid => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${fSnap.data()?.nick}</span>
                <div class="friend-actions">
                    <button class="action-btn" onclick="event.stopPropagation(); window.viewProfile('${uid}')">📋</button>
                    <button class="action-btn del" onclick="event.stopPropagation(); window.removeFromFriends('${uid}')">✕</button>
                </div>
            `;
            li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
            fList.appendChild(li);
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    input.addEventListener('input', () => {
        setTypingStatus(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTypingStatus(false), 3000);
    });

    document.getElementById('sendMsgBtn').onclick = handleSend;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
});
