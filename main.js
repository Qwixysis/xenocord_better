import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Помощники для модалок ---
const toggleModal = (id, show) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'flex' : 'none';
};

// --- Основная логика ---
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

// --- Привязка событий (Замена onclick) ---
document.addEventListener('DOMContentLoaded', () => {
    // Открытие модалок
    document.getElementById('addFriendBtn')?.addEventListener('click', () => toggleModal('friendModal', true));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        toggleModal('profileModal', true);
    });

    // Закрытие модалок
    document.getElementById('closeFriendModal')?.addEventListener('click', () => toggleModal('friendModal', false));
    document.getElementById('closeProfileModal')?.addEventListener('click', () => toggleModal('profileModal', false));

    // Действия
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
    
    document.getElementById('copyUidBox')?.addEventListener('click', () => {
        const uid = document.getElementById('userUid').innerText;
        navigator.clipboard.writeText(uid).then(() => alert("UID скопирован!"));
    });

    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const nick = document.getElementById('editNickInput').value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            toggleModal('profileModal', false);
        }
    });

    document.getElementById('confirmSendRequest')?.addEventListener('click', async () => {
        const input = document.getElementById("friendUidInput");
        const fUid = input.value.trim();
        if (!fUid || fUid === auth.currentUser.uid) return alert("Некорректный UID");
        try {
            await updateDoc(doc(db, "users", fUid), { pending: arrayUnion(auth.currentUser.uid) });
            alert("Запрос отправлен!");
            input.value = "";
            toggleModal('friendModal', false);
        } catch (e) { alert("Ошибка: юзер не найден"); }
    });

    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
});

// --- Функции чата и друзей ---
async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    if (!fList || !pList) return;

    fList.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.textContent = fSnap.data()?.nick || "Друг";
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        fList.appendChild(li);
    }

    pList.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-ok">OK</button>`;
        li.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            acceptFriend(pUid);
        };
        pList.appendChild(li);
    }
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
        box.innerHTML = snap.docs.map(d => `
            <div class="msg ${d.data().senderUid === auth.currentUser.uid ? 'my' : ''}">${d.data().text}</div>
        `).join("");
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
