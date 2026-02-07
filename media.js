import { auth } from "./firebase.js";
import { 
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } 
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const db = getFirestore();
const storage = getStorage();

window.sendMedia = async function(currentChatUid) {
  const fileInput = document.getElementById("mediaInput");
  if (fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const user = auth.currentUser;
  if (!currentChatUid) {
    alert("Сначала выбери друга для чата!");
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    alert("Можно отправлять только фото или видео.");
    return;
  }

  try {
    const storageRef = ref(storage, `media/${user.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    const chatId = [user.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
      senderUid: user.uid,
      senderNick: user.displayName || user.email,
      mediaUrl: url,
      mediaType: isImage ? "image" : "video",
      timestamp: serverTimestamp()
    });

    fileInput.value = "";
  } catch (err) {
    console.error("Ошибка при отправке медиа:", err);
    alert("Не удалось отправить файл.");
  }
};
