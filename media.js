import { auth } from "./firebase.js";
import { 
  getFirestore, doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } 
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const db = getFirestore();
const storage = getStorage();
let unsubscribeChat = null;

// --- Отправка фото/видео ---
window.sendMedia = async function(currentChatUid) {
  const fileInput = document.getElementById("mediaInput");
  if (fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const user = auth.currentUser;
  if (!currentChatUid) {
    alert("Сначала выбери друга для чата!");
    return;
  }

  // Проверка размера
  if (file.size > 5 * 1024 * 1024) {
    alert("Файл слишком большой! Макс 5 MB.");
    return;
  }

  // Определяем тип
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    alert("Можно отправлять только фото (.png/.jpg) или видео (.mp4/.mov).");
    return;
  }

  // Проверка лимитов
  const today = new Date().toISOString().split("T")[0];
  const limitRef = doc(db, "dailyLimits", user.uid + "_" + today);
  let limits = { photos: 0, videos: 0 };

  const snap = await getDoc(limitRef);
  if (snap.exists()) limits = snap.data();

  if (isImage && limits.photos >= 10) {
    alert("Лимит фото на сегодня исчерпан (10 шт).");
    return;
  }
  if (isVideo && limits.videos >= 3) {
    alert("Лимит видео на сегодня исчерпан (3 шт).");
    return;
  }

  // Загружаем файл в Storage
  const storageRef = ref(storage, `media/${user.uid}/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Сохраняем сообщение в Firestore
  const chatId = [user.uid, currentChatUid].sort().join("_");
  await addDoc(collection(db, "privateMessages", chatId, "messages"), {
    senderUid: user.uid,
    senderNick: user.displayName || user.email,
    mediaUrl: url,
    mediaType: isImage ? "image" : "video",
    timestamp: serverTimestamp()
  });

  // Обновляем лимиты
  await setDoc(limitRef, {
    photos: isImage ? limits.photos + 1 : limits.photos,
    videos: isVideo ? limits.videos + 1 : limits.videos
  });

  fileInput.value = "";
};

// --- Подписка на чат с медиа ---
window.subscribeToChatWithMedia = function(currentChatUid) {
  const user = auth.currentUser;
  const chatId = [user.uid, currentChatUid].sort().join("_");

  const messagesRef = collection(db, "privateMessages", chatId, "messages");
  const q = query(messagesRef, orderBy("timestamp"));

  if (unsubscribeChat) unsubscribeChat();
  unsubscribeChat = onSnapshot(q, (snapshot) => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.text) {
        chatBox.innerHTML += `<p><b>${data.senderNick}:</b> ${data.text}</p>`;
      } else if (data.mediaUrl) {
        if (data.mediaType === "image") {
          chatBox.innerHTML += `<p><b>${data.senderNick}:</b><br><img src="${data.mediaUrl}" width="200"></p>`;
        } else if (data.mediaType === "video") {
          chatBox.innerHTML += `<p><b>${data.senderNick}:</b><br><video src="${data.mediaUrl}" width="300" controls></video></p>`;
        }
      }
    });
  });
};
