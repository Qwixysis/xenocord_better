import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;
let lastMessageIds = new Set(); // Для отслеживания уже отрисованных сообщений

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Пользователь";
            renderFriends(data);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const openModal = (id) => document.getElementById(id).classList.add('active');
    const closeModal = (id) => document.getElementById(id).classList.remove('active');

    document.getElementById('addFriendBtn')?.addEventListener('click', () => openModal('friendModal'));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        openModal('profileModal');
    });

    document.querySelectorAll('.secondary').forEach(btn => {
        btn.onclick = () => { closeModal('friendModal'); closeModal('profileModal'); };
    });

    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
    
    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const nick = document.getElementById('editNickInput').value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            closeModal('profileModal');
        }
    });

    document.getElementById('confirmSendRequest')?.addEventListener('click', sendFriendRequest);
    
    document.getElementById('copyUidBox')?.onclick = () => {
        navigator.clipboard.writeText(document.getElementById('userUid').innerText);
        alert("UID скопирован!");
    };
});

async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    fList.innerHTML = "";
    pList.innerHTML = "";

    (data.friends || []).forEach(async (fUid) => {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span><button class="del-btn">✕</button>`;
        li.onclick = () => { openChat(fUid, fSnap.data()?.nick); document.getElementById('sidebar').classList.remove('active'); };
        li.querySelector('.del-btn').onclick = (e) => { e.stopPropagation(); if(confirm("Удалить из друзей?")) removeFriend(fUid); };
        fList.appendChild(li);
    });

    (data.pending || []).forEach(async (pUid) => {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-ok">OK</button>`;
        li.querySelector('button').onclick = (e) => { e.stopPropagation(); acceptFriend(pUid); };
        pList.appendChild(li);
    });
}

async function removeFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
}

async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return; // Не переоткрывать тот же чат
    currentChatUid = fUid;
    lastMessageIds.clear(); // Очищаем историю для нового чата
    
    document.getElementById("chatTitle").innerText = nick;
    document.getElementById("chatBox").innerHTML = ""; // Очищаем экран при смене чата
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();
    
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        
        snap.docChanges().forEach((change) => {
            if (change.type === "added") {
                const d = change.doc;
                const msgId = d.id;
                
                // Проверяем, было ли сообщение уже отрисовано
                if (!lastMessageIds.has(msgId)) {
                    const isMe = d.data().senderUid === auth.currentUser.uid;
                    const div = document.createElement("div");
                    div.className = `msg ${isMe ? 'my' : ''} new-msg`; // Вешаем класс анимации только новым
                    div.innerText = d.data().text;
                    box.appendChild(div);
                    lastMessageIds.add(msgId);
                }
            }
        });
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
    input.focus();
}

async function sendFriendRequest() {
    const val = document.getElementById("friendUidInput").value.trim();
    if (!val || val === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", val), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        document.getElementById('friendModal').classList.remove('active');
    } catch (e) { alert("Ошибка: юзер не найден"); }
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}
