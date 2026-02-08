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
   БЛОК 1: ГЛОБАЛЬНЫЕ ФУНКЦИИ (FIX ДЛЯ HTML)
   ============================================================ */
const initGlobals = () => {
    window.openModal = (id) => document.getElementById(id)?.classList.add('active');
    window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');
    
    window.showTab = (tabId, btn) => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        btn?.classList.add('active');
    };

    window.saveProfile = async function() {
        const user = auth.currentUser;
        if (!user) return;
        const nick = document.getElementById('nickInput')?.value.trim();
        const bio = document.getElementById('bioInput')?.value.trim();
        const ava = document.getElementById('avaInput')?.value.trim();
        try {
            await updateDoc(doc(db, "users", user.uid), { 
                nick: nick || "Jarvis", 
                bio: bio || "", 
                ava: ava || "" 
            });
            alert("Профиль обновлен!");
        } catch (e) { console.error("Save error:", e); }
    };

    window.viewProfile = async (fUid) => {
        const snap = await getDoc(doc(db, "users", fUid));
        if (snap.exists()) {
            const d = snap.data();
            alert(`Профиль: ${d.nick}\nО себе: ${d.bio || 'Пусто'}`);
        }
    };

    window.removeFromFriends = async (fUid) => {
        if(!confirm("Удалить из друзей?")) return;
        const myUid = auth.currentUser.uid;
        await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
        await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
    };

    window.sendFriendRequest = async () => {
        const input = document.getElementById('friendUidInput');
        const uid = input?.value.trim();
        if (!uid || uid === auth.currentUser.uid) return;
        try {
            await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
            alert("Запрос отправлен!");
            window.closeModal('addFriendModal');
            input.value = "";
        } catch (e) { alert("Пользователь не найден!"); }
    };

    window.acceptFriend = async (uid) => {
        const myUid = auth.currentUser.uid;
        await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
        await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
    };
    
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
            input.style.border = "1px solid var(--accent)";
        }
    };
};

// Запускаем сразу
initGlobals();

/* ============================================================
   БЛОК 2: СЛУШАТЕЛЬ СОСТОЯНИЯ (КЛЮЧ К ВХОДУ)
   ============================================================ */
onAuthStateChanged(auth, (user) => {
    // Если мы на app.html, но не залогинены — кидаем на вход
    if (!user && window.location.pathname.includes("app.html")) {
        window.location.href = "index.html";
        return;
    }

    if (user) {
        console.log("Авторизован как:", user.uid);
        // Загружаем данные
        const uidEl = document.getElementById("userUid");
        if (uidEl) uidEl.innerText = user.uid;

        onSnapshot(doc(db, "users", user.uid), (snap) => {
            const d = snap.data();
            if (!d) return;

            const nickEl = document.getElementById("userNick");
            if (nickEl) nickEl.innerText = d.nick || "Jarvis";

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
                    li.onclick = () => window.openChat(fUid, fData?.nick);
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
                    li.style.display = "flex";
                    li.style.justifyContent = "space-between";
                    li.innerHTML = `
                        <span>${pSnap.data()?.nick || 'Запрос'}</span>
                        <button class="btn-primary" onclick="window.acceptFriend('${pUid}')" style="padding: 2px 8px; font-size: 10px;">Принять</button>
                    `;
                    pList.appendChild(li);
                });
            }
        });
    }
});

/* ============================================================
   БЛОК 3: ЛОГИКА СООБЩЕНИЙ
   ============================================================ */
let typingTimeout;
const setTypingStatus = (isTyping) => {
    if (!currentChatUid || !auth.currentUser) return;
    const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
    setDoc(typingRef, { isTyping, lastUpdate: serverTimestamp() }, { merge: true });
};

const handleSend = async () => {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");

    if (editMode.active) {
        await updateDoc(doc(db, "privateMessages", chatId, "messages", editMode.msgId), { text, isEdited: true });
        editMode = { active: false, msgId: null };
        input.style.border = "none";
    } else {
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid, text, timestamp: serverTimestamp()
        });
    }
    input.value = "";
    setTypingStatus(false);
};

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const box = document.getElementById("chatBox");
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
        const ts = document.getElementById("typingStatus");
        if (ts) ts.innerText = (s.exists() && s.data().isTyping) ? "печатает..." : "";
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    if (input) {
        input.addEventListener('input', () => {
            setTypingStatus(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => setTypingStatus(false), 2000);
        });
    }
    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.onclick = handleSend;
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
});
