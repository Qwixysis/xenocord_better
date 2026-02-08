import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// Функции управления модалками
const toggleModal = (id, show) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'flex' : 'none';
};

// --- Привязка событий после загрузки ---
document.addEventListener('DOMContentLoaded', () => {
    // Открытие окон
    document.getElementById('addFriendBtn')?.addEventListener('click', () => toggleModal('friendModal', true));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        toggleModal('profileModal', true);
    });

    // Закрытие окон
    document.getElementById('closeFriendModal')?.addEventListener('click', () => toggleModal('friendModal', false));
    document.getElementById('closeProfileModal')?.addEventListener('click', () => toggleModal('profileModal', false));

    // Действия профиля
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const nick = document.getElementById('editNickInput').value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            toggleModal('profileModal', false);
        }
    });

    // Копирование UID
    document.getElementById('copyUidBox')?.addEventListener('click', () => {
        const uid = document.getElementById('userUid').innerText;
        navigator.clipboard.writeText(uid).then(() => alert("UID скопирован!"));
    });

    // Чат и Добавление друга
    document.getElementById('confirmSendRequest')?.addEventListener('click', sendFriendRequest);
    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
});

// --- Логика Firebase ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Юзер";
            renderFriends(data);
        }
    });
});

async function sendFriendRequest() {
    const input = document.getElementById("friendUidInput");
    const fUid = input.value.trim();
    if (!fUid || fUid === auth.currentUser.uid) return alert("Неверный UID");
    try {
        await updateDoc(doc(db, "users", fUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        toggleModal('friendModal', false);
    } catch (e) { alert("Юзер не найден"); }
}

async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    if (!fList || !pList) return;

    fList.innerHTML = "";
    (data.friends || []).forEach(async (fUid) => {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.textContent = fSnap.data()?.nick || "Друг";
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        fList.appendChild(li);
    });

    pList.innerHTML = "";
    (data.pending || []).forEach(async (pUid) => {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-btn">OK</button>`;
        li.querySelector('button').onclick = () => acceptFriend(pUid);
        pList.appendChild(li);
    });
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}

async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatHeader").innerText = "Чат с: " + nick;
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
    if (!input.value || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
}
