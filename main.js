import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Состояние пользователя ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Юзер";
            renderFriends(data);
        }
    });
});

// --- Привязка событий ---
document.addEventListener('DOMContentLoaded', () => {
    const toggle = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

    // Enter для отправки
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Мобильное меню
    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    // Кнопки открытия модалок
    document.getElementById('addFriendBtn')?.addEventListener('click', () => toggle('friendModal', true));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        toggle('profileModal', true);
    });

    // Универсальное закрытие модалок
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.onclick = () => {
            toggle('friendModal', false);
            toggle('profileModal', false);
        };
    });

    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
    
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const nick = document.getElementById('editNickInput').value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            toggle('profileModal', false);
        }
    });

    document.getElementById('confirmSendRequest')?.addEventListener('click', sendFriendRequest);
    document.getElementById('copyUidBox')?.addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('userUid').innerText);
        alert("UID скопирован!");
    });
});

// --- Функции логики ---
async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    fList.innerHTML = "";
    pList.innerHTML = "";

    (data.friends || []).forEach(async (fUid) => {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.textContent = fSnap.data()?.nick || "Друг";
        li.onclick = () => {
            openChat(fUid, fSnap.data()?.nick);
            document.getElementById('sidebar').classList.remove('active');
        };
        fList.appendChild(li);
    });

    (data.pending || []).forEach(async (pUid) => {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-ok" style="background:var(--accent); color:white; padding:4px 8px; border-radius:5px; font-size:10px;">OK</button>`;
        li.querySelector('button').onclick = (e) => { e.stopPropagation(); acceptFriend(pUid); };
        pList.appendChild(li);
    });
}

async function sendFriendRequest() {
    const val = document.getElementById("friendUidInput").value.trim();
    if (!val || val === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", val), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        document.getElementById('friendModal').style.display = 'none';
    } catch (e) { alert("Ошибка: пользователь не найден"); }
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}

async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = snap.docs.map(d => `<div class="msg ${d.data().senderUid === auth.currentUser.uid ? 'my' : ''}">${d.data().text}</div>`).join("");
        box.scrollTop = box.scrollHeight;
    });
}

async function sendMessage() {
    const input = document.getElementById("chatInput");
    if (!input.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
}
