import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { 
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { 
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  addDoc,
  deleteDoc,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxC3ynsW0-lgxXkxinWGGk5NDlW1SMvCA",
  authDomain: "lovesync-8d805.firebaseapp.com",
  projectId: "lovesync-8d805",
  storageBucket: "lovesync-8d805.appspot.com",
  messagingSenderId: "204018298277",
  appId: "1:204018298277:web:c9b8e716830ef2dd8acc4c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { 
  app,
  auth,
  db,
  storage,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  addDoc,
  deleteDoc,
  orderBy,
  ref,
  uploadBytes,
  getDownloadURL
};

// Вспомогательная функция для генерации кода
function generateRandomCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Вспомогательная функция для конвертации файла в base64
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}

// AuthService
export const authService = {
  auth,
  async register(email, password, name) {
    try {
      // Проверка минимальной длины пароля
      if (password.length < 6) {
        return { 
          success: false, 
          error: "Пароль должен содержать минимум 6 символов" 
        };
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await setDoc(doc(db, "users", user.uid), {
        name, 
        email, 
        createdAt: new Date(), 
        avatar: null,
        avatarType: null,
        partnerId: null, 
        coupleId: null
      });
      
      return { 
        success: true, 
        user: { uid: user.uid, email, name } 
      };
    } catch (error) {
      let errorMessage = "Произошла ошибка при регистрации";
      
      switch(error.code) {
        case 'auth/email-already-in-use':
          errorMessage = "Этот email уже используется";
          break;
        case 'auth/invalid-email':
          errorMessage = "Некорректный email адрес";
          break;
        case 'auth/weak-password':
          errorMessage = "Пароль слишком слабый";
          break;
        case 'auth/operation-not-allowed':
          errorMessage = "Регистрация временно недоступна";
          break;
      }
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  },

  async login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        return { 
          success: false, 
          error: "Данные пользователя не найдены" 
        };
      }
      
      return { 
        success: true, 
        user: { id: user.uid, email: user.email, ...userDoc.data() } 
      };
    } catch (error) {
      let errorMessage = "Произошла ошибка при входе";
      
      switch(error.code) {
        case 'auth/user-not-found':
          errorMessage = "Пользователь с таким email не найден";
          break;
        case 'auth/wrong-password':
          errorMessage = "Неверный пароль";
          break;
        case 'auth/invalid-email':
          errorMessage = "Некорректный email адрес";
          break;
        case 'auth/too-many-requests':
          errorMessage = "Слишком много попыток. Попробуйте позже";
          break;
        case 'auth/user-disabled':
          errorMessage = "Аккаунт заблокирован";
          break;
      }
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  },

  async logout() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

};

// UserService
export const userService = {
  async getUser(userId) {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) return { success: false, error: "Пользователь не найден" };
      return { success: true, user: { id: userId, ...userDoc.data() } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  async updateUser(userId, data) {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, data);
      return { success: true };
    } catch (error) {
      console.error("Error updating user:", error);
      return { success: false, error: error.message };
    }
  },

  async uploadAvatar(userId, file) {
    try {
      const base64String = await convertFileToBase64(file);
      await updateDoc(doc(db, "users", userId), {
        avatar: base64String,
        avatarType: file.type
      });
      return { success: true, url: `data:${file.type};base64,${base64String}` };
    } catch (error) {
      console.error("Upload error:", error);
      return { success: false, error: error.message };
    }
  },

  async generateInviteCode(userId) {
    try {
      const code = generateRandomCode(10);
      await updateDoc(doc(db, "users", userId), { 
        inviteCode: code,
        inviteCodeGeneratedAt: new Date() 
      });
      return { success: true, code };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  async connectByInviteCode(userId, code) {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("inviteCode", "==", code));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return { success: false, error: "Код приглашения не найден" };
      }
      
      const partnerDoc = querySnapshot.docs[0];
      const partnerId = partnerDoc.id;
      
      if (partnerId === userId) {
        return { success: false, error: "Нельзя подключиться к самому себе" };
      }
      
      const coupleResult = await coupleService.createCouple(userId, partnerId);
      if (!coupleResult.success) {
        return coupleResult;
      }
      
      await updateDoc(doc(db, "users", partnerId), { inviteCode: null });
      
      return { 
        success: true, 
        coupleId: coupleResult.coupleId,
        partner: { id: partnerId, ...partnerDoc.data() }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async disconnectPartner(userId, partnerId) {
    try {
      // Обновляем данные обоих пользователей в одной транзакции
      const batch = writeBatch(db);
      
      // Отключаем текущего пользователя
      const userRef = doc(db, "users", userId);
      batch.update(userRef, {
        partnerId: null,
        coupleId: null
      });
      
      // Отключаем партнёра (если он существует)
      if (partnerId) {
        const partnerRef = doc(db, "users", partnerId);
        batch.update(partnerRef, {
          partnerId: null,
          coupleId: null
        });
      }
      
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error("Disconnect error:", error);
      return { success: false, error: error.message };
    }
  }
};

// QuestionsService
export const questionsService = {
  async submitAnswer(coupleId, userId, question, answer) {
    try {
      // Сначала убедимся, что документ пары существует
      const coupleRef = doc(db, "couples", coupleId);
      const coupleSnap = await getDoc(coupleRef);
      
      if (!coupleSnap.exists()) {
        // Создаем документ пары, если его нет
        await setDoc(coupleRef, {
          user1Id: coupleId.split('_')[0],
          user2Id: coupleId.split('_')[1],
          createdAt: new Date(),
          status: "active"
        });
      }
      
      // Теперь добавляем ответ в подколлекцию
      const answersRef = collection(db, "couples", coupleId, "answers");
      const newAnswerRef = doc(answersRef);
      
      const answerData = {
        question,
        answer,
        userId,
        date: new Date(),
        coupleId: coupleId
      };

      await setDoc(newAnswerRef, answerData);
      return { success: true, answerId: newAnswerRef.id };
    } catch (error) {
      console.error("Submit answer error:", error);
      return { success: false, error: error.message };
    }
  },

  async getAnswers(coupleId) {
    try {
      const answersRef = collection(db, "couples", coupleId, "answers");
      const q = query(answersRef, orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      
      const answers = [];
      querySnapshot.forEach((doc) => {
        answers.push({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date // Firebase Timestamp
        });
      });
      
      return { success: true, answers };
    } catch (error) {
      // Если коллекции не существует, возвращаем пустой массив
      if (error.code === 'not-found') {
        return { success: true, answers: [] };
      }
      console.error("Get answers error:", error);
      return { success: false, error: error.message };
    }
  },

  async deleteAnswer(coupleId, answerId) {
    try {
      const answerRef = doc(db, "couples", coupleId, "answers", answerId);
      await deleteDoc(answerRef);
      return { success: true };
    } catch (error) {
      console.error("Delete answer error:", error);
      return { success: false, error: error.message };
    }
  }
};

// PhotoService
export const photoService = {
  async uploadPhotoOfDay(coupleId, file) {
    try {
      const storageRef = ref(storage, `couples/${coupleId}/photos/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return { success: true, url: downloadURL };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const wishesService = {
  async addWish(userId, coupleId, text, isPersonal) {
    try {
      const wishData = {
        text,
        authorId: userId,
        isPersonal,
        isCompleted: false,
        createdAt: new Date(),
        completedAt: null
      };

      // Добавляем coupleId только для общих желаний
      if (!isPersonal) {
        wishData.coupleId = coupleId;
      }

      const wishRef = await addDoc(collection(db, "wishes"), wishData);
      return { success: true, wishId: wishRef.id };
    } catch (error) {
      console.error("Error adding wish:", error);
      return { success: false, error: error.message };
    }
  },

  async getWishes(userId, coupleId) {
    try {
      // Получаем личные желания пользователя (упрощенный запрос)
      const personalQuery = query(
        collection(db, "wishes"),
        where("authorId", "==", userId),
        where("isPersonal", "==", true)
        // Убрали orderBy чтобы избежать необходимости в сложном индексе
      );
      
      // Получаем общие желания пары (упрощенный запрос)
      let sharedWishes = [];
      if (coupleId) {
        const sharedQuery = query(
          collection(db, "wishes"),
          where("coupleId", "==", coupleId),
          where("isPersonal", "==", false)
          // Убрали orderBy
        );
        const sharedSnapshot = await getDocs(sharedQuery);
        sharedWishes = sharedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
      
      const personalSnapshot = await getDocs(personalQuery);
      const personalWishes = personalSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Сортируем вручную на клиенте
      personalWishes.sort((a, b) => b.createdAt - a.createdAt);
      sharedWishes.sort((a, b) => b.createdAt - a.createdAt);
      
      return { 
        success: true, 
        personalWishes, 
        sharedWishes 
      };
    } catch (error) {
      console.error("Error getting wishes:", error);
      return { success: false, error: error.message };
    }
  },

  async getPartnerWishes(partnerId) {
    try {
      const querySnapshot = await getDocs(query(
        collection(db, "wishes"),
        where("authorId", "==", partnerId),
        where("isPersonal", "==", true)
      ));
      
      return { 
        success: true, 
        wishes: querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().createdAt.toDate()
        }))
      };
    } catch (error) {
      console.error("Error getting partner wishes:", error);
      return { success: false, error: error.message };
    }
  },

  async toggleWishCompletion(wishId, isCompleted) {
    try {
      await updateDoc(doc(db, "wishes", wishId), {
        isCompleted,
        completedAt: isCompleted ? new Date() : null
      });
      return { success: true };
    } catch (error) {
      console.error("Error toggling wish completion:", error);
      return { success: false, error: error.message };
    }
  },

  async deleteWish(wishId) {
    try {
      await deleteDoc(doc(db, "wishes", wishId));
      return { success: true };
    } catch (error) {
      console.error("Error deleting wish:", error);
      return { success: false, error: error.message };
    }
  }
};

export const calendarService = {
  async addEvent(coupleId, eventData) {
    try {
      const eventRef = await addDoc(
        collection(db, "couples", coupleId, "events"), 
        eventData
      );
      return { success: true, eventId: eventRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getEvents(coupleId) {
    try {
      const eventsRef = collection(db, "couples", coupleId, "events");
      const q = query(eventsRef, orderBy("date"));
      const querySnapshot = await getDocs(q);
      
      return { 
        success: true, 
        events: querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async updateEvent(coupleId, eventId, updates) {
    try {
      await updateDoc(doc(db, "couples", coupleId, "events", eventId), updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async deleteEvent(coupleId, eventId) {
    try {
      await deleteDoc(doc(db, "couples", coupleId, "events", eventId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const memoriesService = {
  async uploadMemory(coupleId, file, date, description) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=7913ce363b51702fa967a700cf830fea`, {
        method: 'POST',
        body: formData
      });
      
      const imgbbData = await imgbbResponse.json();
      console.log('ImgBB response:', imgbbData); // Логируем ответ

      if (!imgbbData.success) {
        throw new Error(imgbbData.error?.message || 'Ошибка загрузки на ImgBB');
      }
      
      const memoryRef = await addDoc(collection(db, "couples", coupleId, "memories"), {
        url: imgbbData.data.url,
        date: date || new Date(),
        description: description || '',
        authorId: auth.currentUser.uid,
        createdAt: new Date()
      });
      
      return { 
        success: true, 
        memoryId: memoryRef.id,
        url: imgbbData.data.url 
      };
    } catch (error) {
      console.error("Upload memory error:", error);
      return { success: false, error: error.message };
    }
  },

  async updateMemory(coupleId, memoryId, updates) {
    try {
      await updateDoc(doc(db, "couples", coupleId, "memories", memoryId), updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // getMemories и deleteMemory остаются без изменений
  async getMemories(coupleId) {
    try {
      const memoriesRef = collection(db, "couples", coupleId, "memories");
      const q = query(memoriesRef, orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      
      const memories = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
      }));
      
      return { success: true, memories };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async deleteMemory(coupleId, memoryId) {
    try {
      await deleteDoc(doc(db, "couples", coupleId, "memories", memoryId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export const coupleService = {
  async createCouple(user1Id, user2Id) {
    try {
      // Создаем ID пары, сортируя ID пользователей для уникальности
      const coupleId = [user1Id, user2Id].sort().join('_');
      
      const coupleRef = doc(db, "couples", coupleId);
      const coupleSnap = await getDoc(coupleRef);
      
      // Если пара уже существует, возвращаем её ID
      if (coupleSnap.exists()) {
        return { success: true, coupleId };
      }
      
      // Создаем новую пару
      await setDoc(coupleRef, {
        user1Id,
        user2Id,
        createdAt: new Date(),
        status: "active"
      });
      
      // Обновляем пользователей
      const batch = writeBatch(db);
      
      const user1Ref = doc(db, "users", user1Id);
      batch.update(user1Ref, {
        partnerId: user2Id,
        coupleId
      });
      
      const user2Ref = doc(db, "users", user2Id);
      batch.update(user2Ref, {
        partnerId: user1Id,
        coupleId
      });
      
      await batch.commit();
      
      return { success: true, coupleId };
    } catch (error) {
      console.error("Create couple error:", error);
      return { success: false, error: error.message };
    }
  }
};