import { auth } from "./firebase.js";
import { 
    onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
    collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- ИНИЦИАЛИЗАЦИЯ И ПРОВЕРКА ВХОДА ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.href.includes("index.html")) {
            window.location.href = "index.html";
        }
        return;
    }

    // Загрузка данных пользователя
    const userDocRef = doc(db, "users", user.uid);
    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(userDocRef, (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Пользователь";
            renderFriendsAndRequests(data);
        }
    });
});

// --- ГЛАВНЫЕ СОБЫТИЯ ---
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const sidebar = document.getElementById('sidebar');

    // Отправка по нажатию Enter (ПК)
    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Мобильное меню
    document.getElementById('menuToggle')?.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Управление модалками
    const setupModal = (btnId, modalId, closeClass) => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            document.getElementById(modalId).style.display = 'flex';
        });
        document.querySelectorAll(`.${closeClass}`).forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById(modalId).style.display = 'none';
            });
        });
    };

    setupModal('addFriendBtn', 'friendModal', 'secondary');
    setupModal('profileBtn', 'profileModal', 'secondary');

    // Кнопки действий
    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
    
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const newNick = document.getElementById('editNickInput').value.trim();
        if (newNick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick: newNick });
            document.getElementById('profileModal').style.display = 'none';
        }
    });

    document.getElementById('confirmSendRequest')?.addEventListener('click', sendFriendRequest);

    document.getElementById('copyUidBox')?.addEventListener('click', () => {
        const uid = document.getElementById('userUid').innerText;
        navigator.clipboard.writeText(uid);
        alert("UID скопирован в буфер обмена!");
    });
});

// --- ЛОГИКА ДРУЗЕЙ ---
async function renderFriendsAndRequests(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    fList.innerHTML = "";
    pList.innerHTML = "";

    // Рендер списка друзей
    if (data.friends) {
        for (const fUid of data.friends) {
            const fSnap = await getDoc(doc(db, "users", fUid));
            const li = document.createElement("li");
            li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span>`;
            li.onclick = () => {
                openChat(fUid, fSnap.data()?.nick);
                document.getElementById('sidebar').classList.remove('active');
            };
            fList.appendChild(li);
        }
    }

    // Рендер запросов
    if (data.pending) {
        for (const pUid of data.pending) {
            const pSnap = await getDoc(doc(db, "users", pUid));
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${pSnap.data()?.nick}</span>
                <button class="mini-ok" style="background:var(--accent); color:white; border-radius:4px; padding:2px 8px; font-size:10px;">ПРИНЯТЬ</button>
            `;
            li.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                acceptFriend(pUid);
            };
            pList.appendChild(li);
        }
    }
}

async function sendFriendRequest() {
    const targetUid = document.getElementById("friendUidInput").value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) {
        alert("Неверный UID");
        return;
    }
    try {
        await updateDoc(doc(db, "users", targetUid), {
            pending: arrayUnion(auth.currentUser.uid)
        });
        alert("Запрос отправлен!");
        document.getElementById('friendModal').style.display = 'none';
        document.getElementById("friendUidInput").value = "";
    } catch (e) {
        alert("Пользователь не найден");
    }
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), {
        friends: arrayUnion(fUid),
        pending: arrayRemove(fUid)
    });
    await updateDoc(doc(db, "users", fUid), {
        friends: arrayUnion(myUid)
    });
}

// --- ЛОГИКА ЧАТА ---
async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = "Чат с: " + nick;
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    
    if (unsubscribeChat) unsubscribeChat();

    const q = query(
        collection(db, "privateMessages", chatId, "messages"),
        orderBy("timestamp")
    );

    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = "";
        snap.forEach(d => {
            const isMe = d.data().senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : ''}`;
            div.innerText = d.data().text;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });
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
    input.focus();
}
