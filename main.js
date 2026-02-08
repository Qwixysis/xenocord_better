import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ПРИВЯЗКА К WINDOW ДЛЯ HTML
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.m-item').forEach(i => i.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
};

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован в буфер!");
};

window.saveProfile = async () => {
    const user = auth.currentUser;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    const ava = document.getElementById('avaInput').value;
    try {
        await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
        alert("Профиль обновлен!");
    } catch (e) { console.error(e); }
};

window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const targetUid = input.value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (e) { alert("Ошибка. Проверьте UID."); }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const box = document.getElementById("chatBox");
    box.innerHTML = "";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            
            const row = document.createElement("div");
            row.className = "msg-row";
            row.innerHTML = `
                <div class="msg-avatar">${(isMe ? 'Вы' : nick)[0]}</div>
                <div class="msg-content">
                    <div class="msg-header">
                        <span class="msg-author">${isMe ? 'Вы' : nick}</span>
                        <span class="msg-time">${m.timestamp ? m.timestamp.toDate().toLocaleTimeString() : '...'}</span>
                    </div>
                    <div class="msg-text">${m.text}</div>
                </div>
            `;
            box.appendChild(row);
        });
        box.scrollTop = box.scrollHeight;
    });
};

const sendMsg = async () => {
    const input = document.getElementById("chatInput");
    if (!input.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
};

// СИСТЕМА СОБЫТИЙ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        
        document.getElementById("userNick").innerText = d.nick || "Jarvis User";
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0].toUpperCase();
        document.getElementById("nickInput").value = d.nick || "";
        document.getElementById("bioInput").value = d.bio || "";

        // Друзья
        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (d.friends || []).forEach(async uid => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `<div class="status-ava" style="width:24px;height:24px;font-size:10px">${(fSnap.data()?.nick || "U")[0]}</div> ${fSnap.data()?.nick}`;
            li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
            fList.appendChild(li);
        });

        // Заявки
        const pList = document.getElementById("pendingList");
        const pCount = document.getElementById("pendingCount");
        pCount.innerText = (d.pending || []).length;
        pList.innerHTML = "";
        (d.pending || []).forEach(async uid => {
            const pSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="primary" onclick="window.acceptFriend('${uid}')">✓</button>`;
            pList.appendChild(li);
        });
    });
});

document.getElementById("sendMsgBtn").onclick = sendMsg;
document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
document.getElementById("logoutBtn").onclick = () => signOut(auth);
