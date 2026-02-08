import { auth } from "./firebase.js";
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
    collection, addDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ (ДЛЯ HTML)
// ==========================================
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.tab-content, .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.m-link, .m-item').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');
};

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    if (uid && uid !== "...") {
        navigator.clipboard.writeText(uid);
        alert("UID скопирован: " + uid);
    }
};

// ==========================================
// ПРОФИЛЬ И ДРУЗЬЯ
// ==========================================
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    try {
        await updateDoc(doc(db, "users", user.uid), { 
            nick: nick || "User", 
            bio: bio || "" 
        });
        alert("Профиль обновлен!");
    } catch (e) {
        console.error("Ошибка сохранения:", e);
    }
};

window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const targetUid = input.value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) {
        alert("Неверный UID");
        return;
    }
    try {
        await updateDoc(doc(db, "users", targetUid), { 
            pending: arrayUnion(auth.currentUser.uid) 
        });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (e) {
        alert("Пользователь не найден");
    }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    try {
        await updateDoc(doc(db, "users", myUid), { 
            friends: arrayUnion(uid), 
            pending: arrayRemove(uid) 
        });
        await updateDoc(doc(db, "users", uid), { 
            friends: arrayUnion(myUid) 
        });
    } catch (e) {
        console.error("Ошибка дружбы:", e);
    }
};

// ==========================================
// ЛОГИКА ЧАТА (ПОЛНЫЙ ЭКРАН)
// ==========================================
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    
    const inputArea = document.getElementById("inputArea");
    if (inputArea) inputArea.style.display = "block";

    const box = document.getElementById("chatBox");
    box.innerHTML = '<div class="welcome-screen"><h2>Загрузка сообщений...</h2></div>';
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        if (snap.empty) {
            box.innerHTML = '<div class="welcome-screen"><h2>Это начало истории с ' + nick + '</h2></div>';
        }
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const msgDiv = document.createElement("div");
            msgDiv.className = "msg-item"; // Используй стили из предыдущего ответа
            msgDiv.innerHTML = `
                <div class="ava-circle" style="width:40px;height:40px;flex-shrink:0;">${(isMe ? 'Я' : nick)[0]}</div>
                <div class="msg-body">
                    <div class="msg-meta">
                        <span class="msg-author" style="font-weight:bold; color:white;">${isMe ? 'Вы' : nick}</span>
                        <span class="msg-time" style="font-size:11px; color:#949ba4; margin-left:8px;">
                            ${m.timestamp ? m.timestamp.toDate().toLocaleTimeString() : '...'}
                        </span>
                    </div>
                    <div class="msg-text" style="color:#dcddde; margin-top:4px;">${m.text}</div>
                </div>
            `;
            box.appendChild(msgDiv);
        });
        box.scrollTop = box.scrollHeight;
    });
};

const sendMsg = async () => {
    const input = document.getElementById("chatInput");
    if (!input || !input.value.trim() || !currentChatUid) return;
    
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    const text = input.value;
    input.value = ""; // Очищаем сразу для скорости

    try {
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Ошибка отправки:", e);
    }
};

// ==========================================
// ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Следим за данными нашего юзера
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;

        // Обновляем UI профиля
        const nickDisplay = document.getElementById("userNick");
        if (nickDisplay) nickDisplay.innerText = d.nick || "Jarvis User";
        
        const uidDisplay = document.getElementById("userUid");
        if (uidDisplay) uidDisplay.innerText = user.uid;

        const avaDisplay = document.getElementById("userAvatarMain");
        if (avaDisplay) avaDisplay.innerText = (d.nick || "J")[0].toUpperCase();

        // Список друзей
        const fList = document.getElementById("friendsList");
        if (fList) {
            fList.innerHTML = "";
            (d.friends || []).forEach(async fUid => {
                const fSnap = await getDoc(doc(db, "users", fUid));
                const fData = fSnap.data();
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="ava-circle" style="width:24px;height:24px;font-size:10px">${(fData?.nick || 'U')[0]}</div>
                    <span>${fData?.nick || 'User'}</span>
                `;
                li.onclick = () => window.openChat(fUid, fData?.nick || 'User');
                fList.appendChild(li);
            });
        }

        // Заявки
        const pList = document.getElementById("pendingList");
        const pCount = document.getElementById("pendingCount");
        if (pList) {
            pList.innerHTML = "";
            const pendingArr = d.pending || [];
            if (pCount) pCount.innerText = pendingArr.length;
            
            pendingArr.forEach(async pUid => {
                const pSnap = await getDoc(doc(db, "users", pUid));
                const pData = pSnap.data();
                const li = document.createElement("li");
                li.style.justifyContent = "space-between";
                li.innerHTML = `
                    <span>${pData?.nick || 'User'}</span>
                    <button onclick="window.acceptFriend('${pUid}')" style="background:#23a559; border:none; color:white; border-radius:3px; cursor:pointer; padding:2px 6px;">✓</button>
                `;
                pList.appendChild(li);
            });
        }
    });
});

// Слушатели кнопок
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById("sendMsgBtn");
    if (sendBtn) sendBtn.onclick = sendMsg;

    const chatInp = document.getElementById("chatInput");
    if (chatInp) {
        chatInp.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMsg();
            }
        };
    }

    const logout = document.getElementById("logoutBtn");
    if (logout) logout.onclick = () => signOut(auth);
});
