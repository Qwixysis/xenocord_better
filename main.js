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
let renderedMsgIds = new Set();

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Jarvis";
            renderFriends(data);
        }
    });
});

// --- Функции Чат-Механик ---

async function setTypingStatus(isTyping) {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    const typingRef = doc(db, "typing", chatId);
    await setDoc(typingRef, { [auth.currentUser.uid]: isTyping }, { merge: true });
}

async function sendMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: text,
        timestamp: serverTimestamp()
    });
    
    input.value = "";
    setTypingStatus(false);
}

async function deleteMessage(msgId) {
    if (!confirm("Удалить сообщение?")) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
}

// --- Интерфейс ---

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');

    chatInput?.addEventListener('input', () => {
        setTypingStatus(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTypingStatus(false), 2000);
    });

    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    document.getElementById('sendMsgBtn')?.onclick = sendMessage;
    
    // Модалки
    const toggleM = (id, act) => document.getElementById(id).classList[act ? 'add' : 'remove']('active');
    document.getElementById('addFriendBtn').onclick = () => toggleM('friendModal', true);
    document.querySelectorAll('.secondary').forEach(b => b.onclick = () => { toggleM('friendModal', false); toggleM('profileModal', false); });
    
    document.getElementById('confirmSendRequest').onclick = sendFriendRequest;
});

async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    fList.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span><button class="del-friend-btn">✕</button>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        li.querySelector('.del-friend-btn').onclick = (e) => {
            e.stopPropagation();
            if(confirm("Удалить друга?")) removeFriend(fUid);
        };
        fList.appendChild(li);
    }
}

async function removeFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
}

async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    renderedMsgIds.clear();
    document.getElementById("chatBox").innerHTML = "";
    document.getElementById("chatTitle").innerText = nick;

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    // Слушатель сообщений
    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        
        // Обработка удаления (удаляем из DOM если документ исчез в базе)
        const currentDocIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(child => {
            if (!currentDocIds.includes(child.dataset.id)) child.remove();
        });

        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const d = change.doc;
                if (!renderedMsgIds.has(d.id)) {
                    const isMe = d.data().senderUid === auth.currentUser.uid;
                    const div = document.createElement("div");
                    div.className = `msg ${isMe ? 'my' : ''} new-msg`;
                    div.dataset.id = d.id;
                    div.innerHTML = `${d.data().text}${isMe ? `<button class="del-msg-btn">✕</button>` : ''}`;
                    if (isMe) div.querySelector('.del-msg-btn').onclick = () => deleteMessage(d.id);
                    box.appendChild(div);
                    renderedMsgIds.add(d.id);
                }
            }
        });
        box.scrollTop = box.scrollHeight;
    });

    // Слушатель печатания
    if (unsubscribeTyping) unsubscribeTyping();
    unsubscribeTyping = onSnapshot(doc(db, "typing", chatId), (snap) => {
        const typingData = snap.data();
        const indicator = document.getElementById("typingIndicator");
        if (typingData && typingData[fUid]) {
            indicator.innerText = `${nick} печатает...`;
        } else {
            indicator.innerText = "";
        }
    });
}

async function sendFriendRequest() {
    const val = document.getElementById("friendUidInput").value.trim();
    if (!val) return;
    try {
        await updateDoc(doc(db, "users", val), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        document.getElementById('friendModal').classList.remove('active');
    } catch { alert("Ошибка!"); }
}
