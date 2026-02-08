import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;
let unsubscribeTyping = null;
let typingTimeout = null;
let shownMsgIds = new Set();

// --- ФИКС МОДАЛОК: Делаем функции глобальными ---
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

// 1. Мониторинг пользователя
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Jarvis";
            renderFriends(data);
            renderPending(data);
        }
    });
});

// 2. Статус "печатает"
async function updateTyping(isTyping) {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await setDoc(doc(db, "typing", chatId), { [auth.currentUser.uid]: isTyping }, { merge: true });
}

// 3. Сообщения
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
    updateTyping(false);
}

async function deleteMsg(msgId) {
    if (!confirm("Удалить сообщение?")) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
}

// 4. Работа с чатом
async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    shownMsgIds.clear();
    const box = document.getElementById("chatBox");
    box.innerHTML = "";
    document.getElementById("chatTitle").innerText = nick;

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });

        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const d = change.doc;
                if (!shownMsgIds.has(d.id)) {
                    const isMe = d.data().senderUid === auth.currentUser.uid;
                    const div = document.createElement("div");
                    div.id = d.id;
                    div.className = `msg ${isMe ? 'my' : ''} new-msg`;
                    div.innerHTML = `<span>${d.data().text}</span>${isMe ? `<button class="del-msg-btn">✕</button>` : ''}`;
                    if (isMe) div.querySelector('.del-msg-btn').onclick = () => deleteMsg(d.id);
                    box.appendChild(div);
                    shownMsgIds.add(d.id);
                }
            }
        });
        box.scrollTop = box.scrollHeight;
    });

    if (unsubscribeTyping) unsubscribeTyping();
    unsubscribeTyping = onSnapshot(doc(db, "typing", chatId), (snap) => {
        const data = snap.data();
        const indicator = document.getElementById("typingIndicator");
        indicator.innerText = (data && data[fUid]) ? `${nick} печатает...` : "";
    });
}

// 5. Рендер списков
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span><button class="del-friend-btn">✕</button>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        li.querySelector('.del-friend-btn').onclick = (e) => {
            e.stopPropagation();
            if(confirm("Удалить из друзей?")) {
                updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(fUid) });
                updateDoc(doc(db, "users", fUid), { friends: arrayRemove(auth.currentUser.uid) });
            }
        };
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.style.background = "rgba(88, 101, 242, 0.1)";
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button class="primary" style="padding: 5px 10px; width: auto;">OK</button>`;
        li.querySelector('button').onclick = async () => {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { 
                friends: arrayUnion(pUid), 
                pending: arrayRemove(pUid) 
            });
            await updateDoc(doc(db, "users", pUid), { friends: arrayUnion(auth.currentUser.uid) });
        };
        list.appendChild(li);
    }
}

// 6. Инициализация событий
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    
    input?.addEventListener('input', () => {
        updateTyping(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => updateTyping(false), 2000);
    });

    input?.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } 
    });

    document.getElementById('sendMsgBtn').onclick = sendMsg;
    
    document.getElementById('saveProfileBtn').onclick = async () => {
        const nick = document.getElementById('editNickInput').value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            window.closeModal('profileModal');
        }
    };

    document.getElementById('confirmSendRequest').onclick = async () => {
        const uid = document.getElementById('friendUidInput').value.trim();
        if (uid && uid !== auth.currentUser.uid) {
            try {
                await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
                alert("Запрос отправлен!");
                window.closeModal('friendModal');
            } catch (e) { alert("Пользователь не найден"); }
        }
    };

    document.getElementById('copyUidBox').onclick = () => {
        navigator.clipboard.writeText(document.getElementById('userUid').innerText);
        alert("UID скопирован!");
    };

    document.getElementById('logoutBtn').onclick = () => signOut(auth);
});
