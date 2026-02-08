import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ФУНКЦИИ ОКРУЖЕНИЯ
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован!");
};

window.saveProfile = async () => {
    const user = auth.currentUser;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    await updateDoc(doc(db, "users", user.uid), { nick, bio });
    alert("Профиль обновлен!");
};

window.sendFriendRequest = async () => {
    const targetUid = document.getElementById('friendUidInput').value.trim();
    if(!targetUid || targetUid === auth.currentUser.uid) return alert("Неверный UID");
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        window.closeModal('addFriendModal');
    } catch(e) { alert("Пользователь не найден"); }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

// ЧАТ
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatHeader").style.display = "flex";
    document.getElementById("inputArea").style.display = "block";
    document.getElementById("chatTitle").innerText = nick;
    
    const box = document.getElementById("chatBox");
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const msg = document.createElement("div");
            msg.style = "margin-bottom: 16px; display: flex; gap: 16px;";
            msg.innerHTML = `
                <div class="ava-circle" style="width:40px; height:40px;">${(isMe ? 'Я' : nick)[0]}</div>
                <div>
                    <div style="font-weight:bold; color:white;">${isMe ? 'Вы' : nick} <span style="font-size:12px; color:gray; font-weight:normal; margin-left:8px;">${m.timestamp?.toDate().toLocaleTimeString() || ''}</span></div>
                    <div style="color:#dcddde; margin-top:4px;">${m.text}</div>
                </div>
            `;
            box.appendChild(msg);
        });
        box.scrollTop = box.scrollHeight;
    });
};

const sendMsg = async () => {
    const inp = document.getElementById("chatInput");
    if(!inp.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: inp.value,
        timestamp: serverTimestamp()
    });
    inp.value = "";
};

// СЛУШАТЕЛЬ СОСТОЯНИЯ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if(!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis";
        document.getElementById("userUid").innerText = user.uid;
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0];
        document.getElementById("pendingCount").innerText = (d.pending || []).length;

        // Список друзей
        const flist = document.getElementById("friendsList");
        flist.innerHTML = "";
        (d.friends || []).forEach(async fuid => {
            const fdoc = await getDoc(doc(db, "users", fuid));
            const li = document.createElement("li");
            li.innerHTML = `<div class="ava-circle" style="width:24px; height:24px; font-size:12px;">${fdoc.data().nick[0]}</div> <span>${fdoc.data().nick}</span>`;
            li.onclick = () => window.openChat(fuid, fdoc.data().nick);
            flist.appendChild(li);
        });

        // Заявки
        const plist = document.getElementById("pendingList");
        plist.innerHTML = "";
        (d.pending || []).forEach(async puid => {
            const pdoc = await getDoc(doc(db, "users", puid));
            const li = document.createElement("li");
            li.innerHTML = `<span>${pdoc.data().nick}</span> <button onclick="window.acceptFriend('${puid}')" style="background:green; color:white; border:none; padding:2px 5px; border-radius:3px;">✓</button>`;
            plist.appendChild(li);
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("sendMsgBtn").onclick = sendMsg;
    document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
    document.getElementById("logoutBtn").onclick = () => signOut(auth);
});
