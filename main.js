// main.js
import { 
  authService,
  userService,
  questionsService,
  wishesService,
  calendarService,
  memoriesService,
  coupleService,
  db // Импортируем db
} from './firebaseService.js';

import { 
  query, 
  orderBy, 
  collection, 
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

import { gameCategories, storyTemplates, drawingThemes } from './gameData.js';

// Application state
const state = {
  currentSection: 'home',
  user: null,
  partner: null,
  isAuthenticated: false,
  currentDate: new Date(),
  relationshipStart: new Date('2024-01-01'),

  questions: [
    'Что сегодня хорошего для тебя сделал партнёр?'
  ],

  answersTab: 'my-answers',

  wishes: {
    personal: [],
    shared: [],
    partner: []
  },

  games: {
    whoAmI: {
      isPlaying: false,
      currentCharacter: null,
      questionsAsked: 0,
      timer: 300, // 5 минут
      categories: gameCategories, // Используем импортированные категории
      currentCategory: null
    },
    collaborativeStory: {
      isPlaying: false,
      currentStory: null,
      currentPart: 0, // Текущий пропуск для заполнения
      players: [],    // Порядок игроков
      filledParts: [], // Заполненные части рассказа
      isPartnerTurn: false // Чья очередь заполнять пропуск
    },
    collaborativeDrawing: {
      isPlaying: false,
      currentCanvas: null,
      players: [],
      isPartnerTurn: false,
      timer: 25,
      timerInterval: null,
      currentTheme: null // Добавляем текущую тему
    }
  },

  memories: {
    photos: [], // Массив фотографий
    selectedPhoto: null // Выбранное фото для просмотра
  }

};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  initializeRouter();
  initializeAuth();
  initializeNavigation();
  initializeModal();
  initializeNotification();
  initializeHome();
  initializeQuestions();
  initializeProfile();
  initializeWishes();
  initializeGames();
  initializeMemories();

  // Показываем landing page по умолчанию
  document.getElementById('landingPage').classList.remove('hidden');

  // Инициализация аутентификации
  authService.onAuthStateChanged(async (user) => {
    if (user) {
      state.user = null;
      state.partner = null;

      const userData = await userService.getUser(user.uid);
      if (userData.success) {            
        state.user = userData.user;
        state.isAuthenticated = true;

        await loadMemories();
        await loadEvents();
        await loadAnswersHistory();
        await loadWishes();
          
        if (state.user.relationshipStart) {
          state.relationshipStart = new Date(state.user.relationshipStart);
        }
          
        // Загружаем данные партнёра
        if (state.user.partnerId) {
          const { success, user: partner } = await userService.getUser(state.user.partnerId);
          if (success) {
            state.partner = partner;
            updatePartnerUI(partner);
          }
        }
          
        showApp();
        updateCounters();
        loadProfileData();

        // Подписываемся на изменения данных пользователя в реальном времени
        const { db } = await import('./firebaseService.js');
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
          
        const userRef = doc(db, "users", user.uid);
        const unsubscribe = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const userData = doc.data();
              
            // Обрабатываем случай, когда партнёр отключился с другой стороны
            if (!userData.partnerId && state.user.partnerId) {
              state.partner = null;
              state.user.partnerId = null;
              state.user.coupleId = null;
                
              document.getElementById('partnerConnected').classList.add('hidden');
              document.getElementById('partnerNotConnected').classList.remove('hidden');
              showNotification('Ваш партнёр отключил связь с вами');
                
              // Обновляем UI
              loadProfileData();
            }
              
            // Обновляем другие данные пользователя при изменениях
            if (userData.name !== state.user.name) {
              state.user.name = userData.name;
              document.getElementById('profileNameInput').value = userData.name;
            }
              
            if (userData.relationshipStart !== state.user.relationshipStart) {
              state.user.relationshipStart = userData.relationshipStart;
              state.relationshipStart = new Date(userData.relationshipStart);
              document.getElementById('relationshipDateInput').value = userData.relationshipStart;
              updateCounters();
            }
          }
        });

        // Сохраняем функцию отписки для очистки
        state.unsubscribeUserSnapshot = unsubscribe;
      }
    } else {
      // Пользователь вышел из системы
      if (state.unsubscribeUserSnapshot) {
        state.unsubscribeUserSnapshot();
      }
        
      // Полностью очищаем состояние
      state.user = null;
      state.partner = null;
      state.isAuthenticated = false;
      state.events = [];
      state.memories.photos = [];
      state.wishes = {
        personal: [],
        shared: [],
        partner: []
      };
        
      showLanding();
    }
  });

  if (state.isAuthenticated) {
    updateCounters();
  }
  
});

function updatePartnerUI(partner) {
  if (!partner) {
    document.getElementById('partnerConnected').classList.add('hidden');
    document.getElementById('partnerNotConnected').classList.remove('hidden');
    return;
  }
  
  const partnerConnected = document.getElementById('partnerConnected');
  const partnerNameDisplay = document.getElementById('partnerNameDisplay');
  const partnerAvatarImg = document.getElementById('partnerAvatarImg');
  
  if (partnerConnected && partnerNameDisplay && partnerAvatarImg) {
    partnerConnected.classList.remove('hidden');
    document.getElementById('partnerNotConnected').classList.add('hidden');
    
    partnerNameDisplay.textContent = partner.name;
    
    if (partner.avatar) {
      partnerAvatarImg.src = `data:${partner.avatarType};base64,${partner.avatar}`;
    } else {
      partnerAvatarImg.src = "data:image/svg+xml;base64,...";
    }
    
    // Обработчик клика на блок партнёра
    const partnerBlock = partnerConnected.querySelector('.partner-block');
    if (partnerBlock) {
      partnerBlock.onclick = (e) => {
        e.stopPropagation();
        window.location.hash = `#profile/${partner.id}`;
      };
    }
  }
}

function initializeRouter() {
  window.addEventListener('popstate', handleRouteChange);
  handleRouteChange(); // Обработка текущего URL при загрузке
}

async function handleRouteChange() {
  const path = window.location.hash.substring(1);
  const parts = path.split('/');
  
  // Обработка профиля
  if (parts[0] === 'profile') {
    if (!state.isAuthenticated) {
      showSection('home');
      return;
    }

    // Профиль текущего пользователя
    if (!parts[1] || parts[1] === state.user.id) {
      showSection('profile');
      loadProfileData();
    } 
    // Профиль партнёра
    else if (state.partner && parts[1] === state.partner.id) {
      showSection('profile');
      renderPartnerProfile();
    }
    // Чужой профиль
    else {
      const { success, user: profileUser } = await userService.getUser(parts[1]);
      if (success) {
        renderPublicProfile(profileUser);
      } else {
        showNotification('Профиль не найден');
        showSection('home');
      }
    }
  }
  // Остальные разделы
  else if (isValidSection(parts[0])) {
    showSection(parts[0]);
  } 
  else {
    showSection('home');
  }
}

function renderPartnerProfile() {
  if (!state.partner) {
    showNotification('Данные партнёра не загружены');
    window.location.hash = '#profile';
    return;
  }

  // Обновляем заголовок
  document.querySelector('#profile .section-header h2').textContent = `Профиль партнёра: ${state.partner.name}`;
  document.querySelector('#profile .section-header p').textContent = 'Просмотр профиля вашего партнёра';

  // Заполняем данные
  document.getElementById('profileNameInput').value = state.partner.name || 'Не указано';
  document.getElementById('profileEmailInput').value = state.partner.email || 'Не указано';
  document.getElementById('relationshipDateInput').value = state.partner.relationshipStart || '';

  // Аватар
  const avatarImg = document.getElementById('profileAvatarImg');
  avatarImg.src = state.partner.avatar 
    ? `data:${state.partner.avatarType};base64,${state.partner.avatar}`
    : "data:image/svg+xml;base64,...";

  // Блокируем редактирование
  document.getElementById('profileNameInput').disabled = true;
  document.getElementById('relationshipDateInput').disabled = true;
  document.getElementById('avatarInput').style.display = 'none';
  document.querySelector('.profile-avatar button').style.display = 'none';

  // Управление видимостью элементов
  document.getElementById('saveProfileBtn').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.querySelector('.back-to-my-profile').classList.remove('hidden');
  
  document.getElementById('h3Part').classList.add('hidden');
  
  // Скрываем блок партнёра (мы уже в нём)
  document.getElementById('partnerConnected').classList.add('hidden');
  document.getElementById('partnerNotConnected').classList.add('hidden');
}

function isValidSection(section) {
  const validSections = [
    'home', 'questions', 'letters', 
    'calendar', 'goals', 'wishes',
    'dates', 'games', 'profile'
  ];
  return validSections.includes(section);
}

async function showProfilePage(profileId) {
  // Проверяем, это профиль текущего пользователя или партнёра
  if (state.isAuthenticated && (profileId === state.user.id || profileId === state.user.partnerId)) {
    // Показываем стандартную секцию профиля
    showSection('profile');
    // Обновляем URL без перезагрузки страницы
    window.history.pushState({}, '', `#profile/${profileId}`);
  } else {
    // Загружаем данные профиля
    const { success, user: profileUser } = await userService.getUser(profileId);
    if (success) {
      // Показываем специальное представление профиля
      renderPublicProfile(profileUser);
    } else {
      // Если профиль не найден, показываем ошибку
      showNotification('Профиль не найден');
      showSection('home');
    }
  }
}

function renderPublicProfile(profileUser) {
  // Скрываем все секции
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  
  let publicProfileContainer = document.getElementById('publicProfileContainer');
  if (!publicProfileContainer) {
    publicProfileContainer = document.createElement('div');
    publicProfileContainer.id = 'publicProfileContainer';
    publicProfileContainer.className = 'section';
    document.querySelector('main').appendChild(publicProfileContainer);
  }
  
  // Проверяем, является ли этот пользователь партнёром
  const isPartner = state.partner && profileUser.id === state.partner.id;
  
  publicProfileContainer.innerHTML = `
    <div class="container">
      <div class="section-header">
        <h2>Профиль ${profileUser.name}</h2>
        ${isPartner ? '<p>Ваш партнёр 💕</p>' : ''}
      </div>
      <div class="profile-content">
        <div class="profile-info">
          <div class="profile-avatar">
            <img src="${profileUser.avatar ? `data:${profileUser.avatarType};base64,${profileUser.avatar}` : 'data:image/svg+xml;base64,...'}" alt="Аватар">
          </div>
          <div class="profile-details">
            <p>Имя: ${profileUser.name}</p>
            ${isPartner ? `<p>Email: ${profileUser.email}</p>` : ''}
            ${profileUser.relationshipStart ? `<p>В отношениях с: ${new Date(profileUser.relationshipStart).toLocaleDateString()}</p>` : ''}
          </div>
        </div>
        <button class="btn-secondary" onclick="window.history.back()">Назад</button>
      </div>
    </div>
  `;
  
  publicProfileContainer.classList.remove('hidden');
}

function showApp() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function showLanding() {
  document.getElementById('landingPage').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

// ==================== Auth Functions ====================
function initializeAuth() {
  const authTabs = document.querySelectorAll('.auth-tab-btn');
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchAuthTab(tabName);
    });
  });

  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
  document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  document.getElementById('avatarInput')?.addEventListener('change', handleAvatarUpload);
}

function initializeProfile() {
  document.getElementById('generateInviteCode')?.addEventListener('click', generateInviteCode);
  document.getElementById('connectByCode')?.addEventListener('click', connectByInviteCode);
  document.getElementById('disconnectPartner')?.addEventListener('click', disconnectPartner);
  
  // Обработчик кнопки "Назад"
  document.querySelector('.back-to-my-profile')?.addEventListener('click', () => {
    window.location.hash = '#profile';
  });
}

async function generateInviteCode() {
  if (!state.isAuthenticated) return;
  
  try {
    const { success, code, error } = await userService.generateInviteCode(state.user.id);
    if (success) {
      state.user.inviteCode = code;
      document.getElementById('userInviteCode').value = code;
      document.getElementById('generateInviteCode').textContent = 'Обновить';
      showNotification('Код приглашения создан!');
    } else {
      showNotification(`Ошибка: ${error}`);
    }
  } catch (error) {
    showNotification(`Ошибка генерации кода: ${error.message}`);
  }
}

async function connectByInviteCode() {
  if (!state.isAuthenticated) return;
  
  const code = document.getElementById('partnerInviteCode').value.trim();
  if (!code || code.length !== 10) {
    showNotification('Введите 10-значный код приглашения');
    return;
  }
  
  try {
    const { success, partner, error } = await userService.connectByInviteCode(state.user.id, code);
    if (success) {
      state.partner = partner;
      state.user.partnerId = partner.id;
      state.user.coupleId = `${state.user.id}_${partner.id}`;
      
      // Обновляем UI партнёра
      updatePartnerUI(partner);
      showNotification(`Вы успешно подключились к ${partner.name}!`);
      
      // Обновляем раздел профиля
      loadProfileData();
    } else {
      showNotification(`Ошибка: ${error}`);
    }
  } catch (error) {
    showNotification(`Ошибка подключения: ${error.message}`);
  }
}

async function disconnectPartner() {
  if (!state.isAuthenticated || !state.user.partnerId) return;
  
  if (!confirm('Вы уверены, что хотите отключить партнёра? Это разорвёт вашу связь с обеих сторон.')) {
    return;
  }
  
  try {
    const { success, error } = await userService.disconnectPartner(
      state.user.id,
      state.user.partnerId
    );
    
    if (success) {
      // Обновляем состояние
      state.partner = null;
      state.user.partnerId = null;
      state.user.coupleId = null;
      
      // Обновляем UI
      document.getElementById('partnerConnected').classList.add('hidden');
      document.getElementById('partnerNotConnected').classList.remove('hidden');
      
      showNotification('Партнёр отключён. Связь разорвана с обеих сторон.');
    } else {
      showNotification(`Ошибка отключения: ${error}`);
    }
  } catch (error) {
    showNotification(`Ошибка отключения: ${error.message}`);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    showNotification('Пожалуйста, заполните все поля');
    return;
  }

  try {
    const { success, error } = await authService.login(email, password);
    if (success) {
      hideModal('authModal');
      showNotification('Вход выполнен успешно!');
    } else {
      showNotification(error);
    }
  } catch (error) {
    showNotification('Произошла непредвиденная ошибка');
    console.error("Login error:", error);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
  
  // Валидация полей
  if (!name || !email || !password || !passwordConfirm) {
    showNotification('Пожалуйста, заполните все поля');
    return;
  }
  
  if (password !== passwordConfirm) {
    showNotification('Пароли не совпадают');
    return;
  }
  
  if (password.length < 6) {
    showNotification('Пароль должен содержать минимум 6 символов');
    return;
  }
  
  // Проверка формата email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNotification('Пожалуйста, введите корректный email');
    return;
  }

  try {
    const { success, error } = await authService.register(email, password, name);
    if (success) {
      hideModal('authModal');
      showNotification('Регистрация прошла успешно! Добро пожаловать! 💝');
      
      // Показываем форму профиля для заполнения дополнительных данных
      showSection('profile');
    } else {
      showNotification(error);
    }
  } catch (error) {
    showNotification('Произошла непредвиденная ошибка');
    console.error("Register error:", error);
  }
}

async function handleLogout() {
  // Очищаем localStorage
  localStorage.removeItem(`memories_${state.user?.coupleId}`);
  
  const { success, error } = await authService.logout();
  if (success) {
    // Полностью сбрасываем состояние
    state.user = null;
    state.partner = null;
    state.isAuthenticated = false;
    
    showNotification('Вы вышли из системы');
    showLanding();
  } else {
    showNotification(`Ошибка выхода: ${error}`);
  }
}

async function saveProfile() {
  if (!state.isAuthenticated) return;
  
  const updates = {
    name: document.getElementById('profileNameInput').value,
    relationshipStart: document.getElementById('relationshipDateInput').value
  };

  console.log('Saving with date:', updates.relationshipStart); // Добавим логирование

  const { success, error } = await userService.updateUser(state.user.id, updates);
  
  if (success) {
    state.user.name = updates.name;
    state.user.relationshipStart = updates.relationshipStart;
    state.relationshipStart = new Date(updates.relationshipStart); // Важно обновить состояние
    
    console.log('Updated relationshipStart in state:', state.relationshipStart); // Логирование
    
    showNotification('Профиль успешно обновлён!');
    updateCounters(); // Обязательно вызываем обновление счетчиков
  } else {
    showNotification(`Ошибка сохранения профиля: ${error}`);
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Проверяем размер файла (например, не более 1MB)
  if (file.size > 1024 * 1024) {
    showNotification('Файл слишком большой. Максимальный размер 1MB.');
    return;
  }
  
  const { success, url, error } = await userService.uploadAvatar(state.user.id, file);
  if (success) {
    document.getElementById('profileAvatarImg').src = url;
    // Обновляем состояние пользователя
    state.user.avatarUrl = url;
    showNotification('Аватар обновлён!');
  } else {
    showNotification(`Ошибка загрузки аватара: ${error}`);
  }
}

// ==================== UI Functions ====================
function loadProfileData() {
  if (!state.isAuthenticated) return;

  // Проверяем, чей профиль загружаем (мой или партнёра)
  const isPartnerProfile = window.location.hash.includes(`#profile/${state.partner?.id}`);

  if (isPartnerProfile) {
    renderPartnerProfile();
    return;
  }
  
  // Заполняем данные
  document.querySelector('#profile .section-header h2').textContent = 'Мой профиль';
  document.querySelector('#profile .section-header p').textContent = 'Управляйте вашими данными и настройками';

  document.getElementById('profileNameInput').value = state.user.name;
  document.getElementById('profileEmailInput').value = state.user.email;
  document.getElementById('relationshipDateInput').value = state.user.relationshipStart || '';

  // Разблокируем редактирование
  document.getElementById('profileNameInput').disabled = false;
  document.getElementById('relationshipDateInput').disabled = false;
  document.getElementById('avatarInput').style.display = 'block';
  document.querySelector('.profile-avatar button').style.display = 'block';

  // Аватар
  const avatarImg = document.getElementById('profileAvatarImg');
  avatarImg.src = state.user.avatar 
    ? `data:${state.user.avatarType};base64,${state.user.avatar}`
    : "data:image/svg+xml;base64,...";

  // Управление видимостью элементов
  document.getElementById('saveProfileBtn').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('h3Part').classList.remove('hidden');
  document.querySelector('.back-to-my-profile').classList.add('hidden');

  // Показываем блок партнёра (если он есть)
  updatePartnerUI(state.partner);
}

function updateCounters() {
  if (!state.isAuthenticated) return;
  
  const now = new Date();
  const daysTogether = Math.floor((now - state.relationshipStart) / (1000 * 60 * 60 * 24));
  
  // Safely update counters only if elements exist
  const daysCounter = document.getElementById('daysCounter');
  const photosCounter = document.getElementById('photosCounter');
  const goalsCounter = document.getElementById('goalsCounter');
  
  if (daysCounter) daysCounter.textContent = daysTogether;
  if (photosCounter) photosCounter.textContent = state.memories.photos?.length || 0;
  if (goalsCounter) goalsCounter.textContent = state.wishes.shared?.length || 0;
}

// ==================== Navigation ====================
function initializeNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      showSection(section);
    });
  });
}

function showSection(sectionName) {
  // Не обновляем URL если это тот же раздел
  if (state.currentSection === sectionName) return;
  
  // Обновляем состояние
  state.currentSection = sectionName;
  
  // Обновляем URL
  if (sectionName === 'profile' && state.isAuthenticated) {
    window.history.pushState({}, '', `#profile/${state.user.id}`);
  } else {
    window.history.pushState({}, '', `#${sectionName}`);
  }
  
  // Показываем раздел
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
    if (section.id !== 'publicProfileContainer') {
      section.classList.remove('hidden');
    }
  });
  
  const targetSection = document.getElementById(sectionName);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Обновляем активную кнопку в навигации
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-section') === sectionName);
  });
  
  // Скрываем публичный профиль, если он есть
  const publicProfile = document.getElementById('publicProfileContainer');
  if (publicProfile) {
    publicProfile.classList.add('hidden');
  }
}

// ==================== Home Section ====================
function initializeHome() {
  document.getElementById('loveReminderBtn')?.addEventListener('click', showLoveReminder);
  document.getElementById('photoInput')?.addEventListener('change', handlePhotoUpload);
  
  // Загружаем фото при открытии домашней страницы
  if (state.isAuthenticated && state.user?.coupleId) {
    loadMemories();
  }
}

function showLoveReminder() {
  const messages = [
      // Исходные сообщения
      "💕 Я очень сильно люблю тебя!",
      "🌟 Каждый день с тобой делает меня счастливой!",
      "💖 Ты так мило засыпаешь!",
      "🌈 Спасибо, что ты есть в моей жизни!",
      "💝 Я люблю тебя больше, чем слова могут выразить!",
      "🦋 Ты - мой источник счастья!",
      "✨ С тобой я чувствую себя особенно!",
      "💐 Ты - мечта, ставшая реальностью!",
      
      // Новые нежные признания
      "🌹 Ты — самое прекрасное, что случилось со мной!",
      "💞 Моё сердце бьётся только для тебя!",
      "🌙 Даже звёзды меркнут рядом с твоей улыбкой.",
      "🌸 Ты наполняешь мою жизнь теплом и светом.",
      "💎 Ты — редкое сокровище, которое я буду беречь вечно.",
      
      // Милости и комплименты
      "🐻 Ты так мило хмуришься, когда не выспалась!",
      "☀️ Твой смех — мой любимый звук в мире.",
      "🫂 Обнимать тебя — моё самое большое счастье.",
      "🎀 Даже в пижаме ты выглядишь потрясающе!",
      "🍯 Ты слаще, чем самый вкусный мёд.",
      
      // Романтичные и глубокие
      "🌌 С тобой даже обычные моменты становятся волшебными.",
      "🚀 Ты вдохновляешь меня становиться лучше каждый день.",
      "🌊 Любовь к тебе — как океан, безграничная и глубокая.",
      "🕊️ Ты — мой покой и моё приключение одновременно.",
      "🎇 Я благодарен судьбе за каждый миг с тобой.",
      
      // Страстные и трогательные
      "🔥 Ты сводишь меня с ума, даже когда просто смотришь на меня.",
      "💋 Каждый твой поцелуй — как первый.",
      "🖤 Ты — мой самый сладкий наркотик.",
      "💫 Я никогда не устану любить тебя.",
      "💌 Даже если бы у меня было 100 жизней, в каждой я выбрал бы тебя."
  ];

  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  showNotification(randomMessage);
}

async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!state.isAuthenticated || !state.user.coupleId) {
    showNotification('Необходимо создать пару для загрузки фото');
    return;
  }
  const { success, url, error } = await photoService.uploadPhotoOfDay(state.user.coupleId, file);
  if (success) {
    document.getElementById('photoOfDay').innerHTML = `<img src="${url}" alt="Фото дня" style="max-width:100%; max-height:200px;">`;
    showNotification('Фото дня обновлено! 📸');
  } else {
    showNotification(`Ошибка загрузки фото: ${error}`);
  }
}

// ==================== Wishes Section ====================

// Инициализация раздела желаний
function initializeWishes() {
  // Обработчики для вкладок
  document.querySelectorAll('.wishes-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wishes-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.wishes-tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById(`${btn.dataset.tab}Wishes`).classList.add('active');
    });
  });

  // Обработчики для кнопок добавления
  document.getElementById('wishes')?.addEventListener('click', () => {
    if (state.currentSection === 'wishes') {
      loadWishes();
    }
  });

  document.getElementById('wishes')?.addEventListener('hashchange', () => {
    if (window.location.hash === '#wishes') {
      loadWishes();
    }
  });

  document.querySelectorAll('.add-wish-btn').forEach(btn => {
    btn.addEventListener('click', () => showAddWishModal(btn.dataset.list));
  });
}

// Показ модального окна для добавления желания
function showAddWishModal(listType) {
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Добавить новое желание</h3>
    <form id="addWishForm">
      <div class="form-group">
        <textarea id="wishText" placeholder="Опишите ваше желание..." required></textarea>
      </div>
      <input type="hidden" id="wishListType" value="${listType}">
      <button type="submit" class="btn-primary">Добавить</button>
    </form>
  `;
  
  document.getElementById('addWishForm')?.addEventListener('submit', handleAddWish);
  document.getElementById('modal').classList.remove('hidden');
}

// Обработка добавления желания
async function handleAddWish(e) {
  e.preventDefault();
  const text = document.getElementById('wishText').value.trim();
  const listType = document.getElementById('wishListType').value;
  
  if (!text) {
    showNotification('Пожалуйста, введите текст желания');
    return;
  }
  
  if (!state.isAuthenticated) {
    showNotification('Необходимо войти для добавления желаний');
    return;
  }
  
  try {
    let result;
    const isPersonal = listType !== 'common';
    
    if (listType === 'partner' && state.partner) {
      // Добавляем желание для партнёра (как личное)
      result = await wishesService.addWish(
        state.partner.id,
        state.user.coupleId,
        text,
        true
      );
    } else {
      // Проверяем coupleId для общих желаний
      if (!isPersonal && !state.user.coupleId) {
        showNotification('Необходимо создать пару для добавления общих желаний');
        return;
      }
      
      // Добавляем личное или общее желание
      result = await wishesService.addWish(
        state.user.id,
        state.user.coupleId,
        text,
        isPersonal
      );
    }
    
    if (result.success) {
      showNotification('Желание добавлено!');
      hideModal('modal');
      loadWishes();
    } else {
      showNotification(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    console.error("Error adding wish:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

// Загрузка списков желаний
async function loadWishes() {
  if (!state.isAuthenticated) {
    renderWishes(); // This will show empty lists
    return;
  }
  
  try {
    // Загружаем личные и общие желания
    const wishesResult = await wishesService.getWishes(
      state.user.id,
      state.user.coupleId
    );
    
    if (!wishesResult.success) throw new Error(wishesResult.error);
    
    state.wishes.personal = wishesResult.personalWishes;
    state.wishes.shared = wishesResult.sharedWishes;
    
    // Загружаем желания партнёра, если он есть
    if (state.partner) {
      const partnerResult = await wishesService.getPartnerWishes(state.partner.id);
      if (partnerResult.success) {
        state.wishes.partner = partnerResult.wishes;
      }
    }
    
    renderWishes();
  } catch (error) {
    console.error("Load wishes error:", error);
    showNotification('Ошибка загрузки списков желаний');
    renderWishes();
  }
}

// Отображение списков желаний
function renderWishes() {
  // Проверяем и инициализируем элементы DOM
  const yourWishesList = document.getElementById('yourWishes');
  const partnerWishesList = document.getElementById('partnerWishes');
  const commonWishesList = document.getElementById('commonWishes');
  
  if (!yourWishesList || !partnerWishesList || !commonWishesList) {
    console.error("Could not find wishes lists in DOM");
    return;
  }

  // Личные желания пользователя
  yourWishesList.innerHTML = (state.wishes.personal || []).map(wish => `
    <li class="${wish.isCompleted ? 'completed' : ''}" data-id="${wish.id}">
      ${wish.text || ''}
      <div class="wish-actions">
        <button class="wish-toggle" data-id="${wish.id}">
          ${wish.isCompleted ? '❌ Отменить' : '✅ Выполнить'}
        </button>
        <button class="wish-delete" data-id="${wish.id}">🗑️ Удалить</button>
      </div>
    </li>
  `).join('') || '<li>Желания не добавлены</li>';
  
  // Желания партнёра
  partnerWishesList.innerHTML = (state.wishes.partner || []).map(wish => `
    <li class="${wish.isCompleted ? 'completed' : ''}" data-id="${wish.id}">
      ${wish.text || ''}
      <div class="wish-actions">
        <button class="wish-toggle" data-id="${wish.id}">
          ${wish.isCompleted ? '❌ Отменить' : '✅ Выполнить'}
        </button>
      </div>
    </li>
  `).join('') || '<li>Желания не добавлены</li>';
  
  // Общие желания
  commonWishesList.innerHTML = (state.wishes.shared || []).map(wish => `
    <li class="${wish.isCompleted ? 'completed' : ''}" data-id="${wish.id}">
      ${wish.text || ''}
      <div class="wish-author">${wish.authorId === state.user.id ? 'Вы' : (state.partner?.name || 'Партнёр')}</div>
      <div class="wish-actions">
        <button class="wish-toggle" data-id="${wish.id}">
          ${wish.isCompleted ? '❌ Отменить' : '✅ Выполнить'}
        </button>
        ${wish.authorId === state.user.id ? 
          `<button class="wish-delete" data-id="${wish.id}">🗑️ Удалить</button>` : ''}
      </div>
    </li>
  `).join('') || '<li>Нет общих желаний</li>';
  
  // Добавляем обработчики событий
  document.querySelectorAll('.wish-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wishId = btn.dataset.id;
      const wish = [...(state.wishes.personal || []), 
                   ...(state.wishes.shared || []), 
                   ...(state.wishes.partner || [])]
        .find(w => w.id === wishId);
      
      if (wish) {
        await toggleWishCompletion(wishId, !wish.isCompleted);
      }
    });
  });
  
  document.querySelectorAll('.wish-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Вы уверены, что хотите удалить это желание?')) {
        await deleteWish(btn.dataset.id);
      }
    });
  });
}

// Переключение статуса выполнения желания
async function toggleWishCompletion(wishId, isCompleted) {
  try {
    const result = await wishesService.toggleWishCompletion(wishId, isCompleted);
    if (result.success) {
      showNotification(isCompleted ? 'Желание отмечено выполненным!' : 'Статус желания обновлён');
      loadWishes();
    } else {
      showNotification(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    showNotification(`Ошибка: ${error.message}`);
  }
}

// Удаление желания
async function deleteWish(wishId) {
  try {
    const result = await wishesService.deleteWish(wishId);
    if (result.success) {
      showNotification('Желание удалено');
      loadWishes();
    } else {
      showNotification(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    showNotification(`Ошибка: ${error.message}`);
  }
}

// Добавим вызов инициализации в DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // ... существующий код ...
  initializeWishes();
});

// ==================== Questions Section ====================
function initializeQuestions() {
  document.getElementById('submitAnswer')?.addEventListener('click', submitAnswer);
  
  // Обработчики для вкладок
  document.querySelectorAll('.answers-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.answers-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.answersTab = btn.dataset.tab;
      loadAnswersHistory(); // Перезагружаем историю с новым фильтром
    });
  });
  
  loadDailyQuestion();
  loadAnswersHistory();
}

async function loadAnswersHistory() {
  if (!state.isAuthenticated || !state.user?.coupleId) {
    renderAnswersHistory([]);
    return;
  }
  
  try {
    const { success, answers, error } = await questionsService.getAnswers(state.user.coupleId);
    if (success) {
      renderAnswersHistory(answers);
    } else {
      showNotification(`Ошибка загрузки истории: ${error}`);
      renderAnswersHistory([]); // Показываем пустую историю при ошибке
    }
  } catch (error) {
    console.error("Load answers error:", error);
    showNotification(`Ошибка загрузки истории ответов`);
    renderAnswersHistory([]); // Показываем пустую историю при ошибке
  }
}

function loadDailyQuestion() {
  const today = new Date();
  const questionIndex = today.getDate() % state.questions.length;
  document.getElementById('dailyQuestion').textContent = state.questions[questionIndex];
}

function renderAnswersHistory(answers) {
  const historyContainer = document.getElementById('answersHistory');
  historyContainer.innerHTML = '';
  
  if (!answers || answers.length === 0) {
    historyContainer.innerHTML = '<p>Пока нет сохранённых ответов</p>';
    return;
  }
  
  // Фильтрация ответов в зависимости от активной вкладки
  let filteredAnswers = answers;
  if (state.answersTab === 'my-answers') {
    filteredAnswers = answers.filter(a => a.userId === state.user.id);
  } else if (state.answersTab === 'partner-answers' && state.partner) {
    filteredAnswers = answers.filter(a => a.userId === state.partner.id);
  }
  
  if (filteredAnswers.length === 0) {
    const message = state.answersTab === 'my-answers' ? 
      'У вас пока нет ответов' : 
      'У вашего партнёра пока нет ответов';
    historyContainer.innerHTML = `<p>${message}</p>`;
    return;
  }
  
  filteredAnswers.forEach(answer => {
    const answerDate = answer.date?.toDate ? answer.date.toDate() : new Date(answer.date);
    const answerItem = document.createElement('div');
    answerItem.className = 'answer-item';
    answerItem.dataset.id = answer.id;
    
    // Определяем автора ответа
    const isMyAnswer = answer.userId === state.user.id;
    const authorName = isMyAnswer ? 'Вы' : (state.partner?.name || 'Партнёр');
    
    answerItem.innerHTML = `
      <div class="answer-date">${answerDate.toLocaleDateString()}</div>
      <div class="answer-question">${answer.question}</div>
      <div class="answer-text">${answer.answer}</div>
      <div class="answer-author">${authorName}</div>
      ${isMyAnswer ? `<button class="btn-secondary delete-answer-btn" data-id="${answer.id}">Удалить</button>` : ''}
    `;
    
    historyContainer.appendChild(answerItem);
  });
  
  // Добавляем обработчики для кнопок удаления
  document.querySelectorAll('.delete-answer-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const answerId = btn.dataset.id;
      await deleteAnswer(answerId);
    });
  });
}

async function submitAnswer() {
  if (!state.isAuthenticated || !state.user.coupleId) {
    showNotification('Необходимо войти и создать пару для ответа на вопросы');
    return;
  }
  
  const answerText = document.getElementById('questionAnswer').value.trim();
  const questionText = document.getElementById('dailyQuestion').textContent;
  
  if (!answerText) {
    showNotification('Пожалуйста, напишите ответ');
    return;
  }
  
  try {
    const { success, error } = await questionsService.submitAnswer(
      state.user.coupleId,
      state.user.id,
      questionText,
      answerText
    );
    
    if (success) {
      document.getElementById('questionAnswer').value = '';
      showNotification('Ответ сохранён! 💝');
      loadAnswersHistory();
    } else {
      showNotification(`Ошибка сохранения ответа: ${error}`);
    }
  } catch (error) {
    console.error("Submit error:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

async function deleteAnswer(answerId) {
  if (!state.isAuthenticated || !state.user.coupleId) return;
  
  if (!confirm('Вы уверены, что хотите удалить этот ответ?')) {
    return;
  }
  
  try {
    const { success, error } = await questionsService.deleteAnswer(
      state.user.coupleId,
      answerId
    );
    
    if (success) {
      showNotification('Ответ удалён');
      loadAnswersHistory(); // Обновляем историю после удаления
    } else {
      showNotification(`Ошибка удаления: ${error}`);
    }
  } catch (error) {
    showNotification(`Ошибка: ${error.message}`);
  }
}

// ==================== Games ====================
function initializeGames() {
  document.getElementById('startGameBtn')?.addEventListener('click', showWhoAmIGameModal);
  document.getElementById('startStoryGameBtn')?.addEventListener('click', showStoryGameModal);
  initializeWhoAmIGame();
  initializeStoryGame();
  initializeDrawingGame();
  document.getElementById('games')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-game="drawing"]')) {
      showDrawingGameModal();
    }
  });
}

// Дорисуй
function initializeDrawingGame() {
  // Обработчик закрытия модального окна
  document.querySelector('#modal .close')?.addEventListener('click', () => {
    if (state.games.collaborativeDrawing.isPlaying) {
      endDrawingGame();
    }
  });
}

function showDrawingGameModal() {
  const modalBody = document.getElementById('modalBody');
  
  // Создаем список тем
  const themesList = drawingThemes.map(theme => `
    <div class="theme-card" data-id="${theme.id}">
      <h4>${theme.title}</h4>
      <p>${theme.description}</p>
    </div>
  `).join('');
  
  modalBody.innerHTML = `
    <h3>Совместный рисунок</h3>
    <p>Выберите тему для вашего рисунка:</p>
    <div class="themes-grid">
      ${themesList}
    </div>
  `;
  
  // обработчики выбора темы
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const themeId = parseInt(card.dataset.id);
      const selectedTheme = drawingThemes.find(t => t.id === themeId);
      startDrawingGame(selectedTheme); // Передаем выбранную тему
    });
  });
  
  document.getElementById('modal').classList.remove('hidden');
}

function startDrawingGame(theme) {  // Добавляем параметр theme
  // Инициализируем состояние игры
  state.games.collaborativeDrawing = {
    isPlaying: true,
    currentCanvas: null,
    players: [state.user.id, state.partner?.id || state.user.id], // Чередуем игроков
    isPartnerTurn: false, // Первым начинает текущий пользователь
    timer: 25,
    timerInterval: null,
    currentTheme: theme || drawingThemes.find(t => t.id === 6) // Используем переданную тему или тему по умолчанию
  };
  
  // Показываем игровой экран
  renderDrawingGame();
}

function renderDrawingGame() {
  const game = state.games.collaborativeDrawing;
  if (!game.isPlaying) return;
  
  const modalBody = document.getElementById('modalBody');
  const currentPlayer = game.isPartnerTurn ? state.partner?.name || 'Партнёр' : state.user.name;
  
  modalBody.innerHTML = `
    <h3>Совместный рисунок</h3>
    <div class="theme-display">
      <strong>Тема:</strong> ${game.currentTheme.title} - ${game.currentTheme.description}
    </div>
    <p>Сейчас рисует: <strong>${currentPlayer}</strong></p>
    <div class="timer">Осталось: ${Math.floor(game.timer/60)}:${(game.timer%60).toString().padStart(2, '0')}</div>
    
    <div class="drawing-container">
      <canvas id="drawingCanvas" width="500" height="400"></canvas>
    </div>
    
    <div class="drawing-tools">
      <select id="drawingTool">
        <option value="brush">Кисть</option>
        <option value="eraser">Ластик</option>
        <option value="line">Линия</option>
        <option value="rectangle">Прямоугольник</option>
        <option value="circle">Круг</option>
      </select>
      
      <input type="color" id="drawingColor" value="#000000">
      <input type="range" id="drawingSize" min="1" max="20" value="5">
      
      <button id="clearCanvasBtn" class="btn-secondary">Очистить</button>
      <button id="endDrawingBtn" class="btn-secondary">Завершить рисунок</button>
      <button id="endTurnBtn" class="btn-primary">Завершить ход</button>
    </div>
  `;
  
  setupCanvas();
  startDrawingTimer();
}

function setupCanvas() {
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  
  // Если есть сохранённый рисунок - восстанавливаем его
  if (state.games.collaborativeDrawing.currentCanvas) {
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0);
    };
    img.src = state.games.collaborativeDrawing.currentCanvas;
  } else {
    // Начальный белый фон
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Реализация рисования
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let tool = 'pencil';
  let color = '#000000';
  let size = 5;
  
  // Обработчики инструментов
  document.getElementById('drawingTool')?.addEventListener('change', (e) => {
    tool = e.target.value;
  });
  
  document.getElementById('drawingColor')?.addEventListener('change', (e) => {
    color = e.target.value;
  });
  
  document.getElementById('drawingSize')?.addEventListener('input', (e) => {
    size = e.target.value;
  });
  
  // Очистка холста
  document.getElementById('clearCanvasBtn')?.addEventListener('click', () => {
    if (confirm('Очистить весь рисунок?')) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  });
  
  // Завершение хода
  document.getElementById('endTurnBtn')?.addEventListener('click', endDrawingTurn);
  
  // Завершение рисунка
  document.getElementById('endDrawingBtn')?.addEventListener('click', () => {
    if (confirm('Завершить рисунок и выйти из игры?')) {
      endDrawingGame();
    }
  });
  
  // Обработчики рисования
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
    
    if (tool === 'text') {
      const text = prompt('Введите текст:', '');
      if (text) {
        ctx.font = `${size}px Arial`;
        ctx.fillStyle = color;
        ctx.fillText(text, lastX, lastY);
      }
      isDrawing = false;
    }
  }
  
  function draw(e) {
    if (!isDrawing) return;
    
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'; // Режим ластика
    } else {
      ctx.globalCompositeOperation = 'source-over'; // Обычный режим рисования
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
    }
    
    switch(tool) {
      case 'pencil':
      case 'brush':
      case 'eraser':
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
        break;
        
      case 'line':
        // Временная линия при движении
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.games.collaborativeDrawing.currentCanvas) {
          const img = new Image();
          img.src = state.games.collaborativeDrawing.currentCanvas;
          ctx.drawImage(img, 0, 0);
        }
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        break;
        
      case 'rectangle':
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.games.collaborativeDrawing.currentCanvas) {
          const img = new Image();
          img.src = state.games.collaborativeDrawing.currentCanvas;
          ctx.drawImage(img, 0, 0);
        }
        ctx.beginPath();
        ctx.rect(lastX, lastY, e.offsetX - lastX, e.offsetY - lastY);
        ctx.stroke();
        break;
        
      case 'circle':
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.games.collaborativeDrawing.currentCanvas) {
          const img = new Image();
          img.src = state.games.collaborativeDrawing.currentCanvas;
          ctx.drawImage(img, 0, 0);
        }
        ctx.beginPath();
        const radius = Math.sqrt(Math.pow(e.offsetX - lastX, 2) + Math.pow(e.offsetY - lastY, 2));
        ctx.arc(lastX, lastY, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }
  }
  
  function stopDrawing() {
    if (!isDrawing) return;
    
    isDrawing = false;
    
    // Сохраняем текущее состояние canvas
    state.games.collaborativeDrawing.currentCanvas = canvas.toDataURL();
  }
}

function startDrawingTimer() {
  const game = state.games.collaborativeDrawing;
  
  // Очищаем предыдущий таймер, если он был
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }
  
  game.timerInterval = setInterval(() => {
    game.timer--;
    
    // Обновляем отображение таймера
    const timerElement = document.querySelector('.timer');
    if (timerElement) {
      timerElement.textContent = `Осталось: ${Math.floor(game.timer/60)}:${(game.timer%60).toString().padStart(2, '0')}`;
    }
    
    // Если время вышло
    if (game.timer <= 0) {
      endDrawingTurn();
    }
  }, 1000);
}

function endDrawingTurn() {
  const game = state.games.collaborativeDrawing;
  
  // Останавливаем таймер
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
  
  // Передаем ход другому игроку
  game.isPartnerTurn = !game.isPartnerTurn;
  game.timer = 25; // Сбрасываем таймер
  
  // Сохраняем текущее состояние canvas
  const canvas = document.getElementById('drawingCanvas');
  if (canvas) {
    game.currentCanvas = canvas.toDataURL();
  }
  
  // Перерисовываем игровой экран
  renderDrawingGame();
}

function endDrawingGame() {
  const game = state.games.collaborativeDrawing;
  
  // Останавливаем таймер
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }
  
  // Показываем итоговый рисунок
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Ваш совместный рисунок</h3>
    <div class="theme-display">
      <strong>Тема:</strong> ${game.currentTheme.title} - ${game.currentTheme.description}
    </div>
    <div class="completed-drawing">
      <img src="${game.currentCanvas}" alt="Совместный рисунок" style="max-width: 100%; border: 1px solid #ddd;">
    </div>
    <div class="drawing-actions">
      <button id="playAgainBtn" class="btn-primary">Играть снова</button>
    </div>
  `;
  
  document.getElementById('saveDrawingBtn')?.addEventListener('click', saveDrawing);
  document.getElementById('playAgainBtn')?.addEventListener('click', showDrawingGameModal);
  
  // Завершаем игру
  game.isPlaying = false;
}

function saveDrawing() {
  if (!state.games.collaborativeDrawing.currentCanvas) return;
  
  // Здесь можно добавить сохранение рисунка в базу данных
  showNotification('Рисунок сохранён в ваших воспоминаниях!');
  
  // Для примера просто закрываем модальное окно
  hideModal('modal');
  state.games.collaborativeDrawing.isPlaying = false;
}


// Игра "Продолжи историю"

// Показ модального окна для начала игры
function showStoryGameModal() {
  const modalBody = document.getElementById('modalBody');
  
  // Создаем список шаблонов рассказов
  const storiesList = storyTemplates.map(story => `
    <div class="story-template" data-id="${story.id}">
      <h4>${story.title}</h4>
    </div>
  `).join('');
  
  modalBody.innerHTML = `
    <h3>Совместный рассказ</h3>
    <p>Выберите ваш рассказ:</p>
    <div class="story-templates-list">
      ${storiesList}
    </div>
  `;
  
  // Добавляем обработчики выбора шаблона
  document.querySelectorAll('.story-template').forEach(template => {
    template.addEventListener('click', () => {
      const storyId = parseInt(template.dataset.id);
      startStoryGame(storyId);
    });
  });
  
  document.getElementById('modal').classList.remove('hidden');
}

// Начало игры
function startStoryGame(storyId) {
  const story = storyTemplates.find(s => s.id === storyId);
  if (!story) return;
  
  // Инициализируем состояние игры
  state.games.collaborativeStory = {
    isPlaying: true,
    currentStory: story,
    currentPart: 0,
    players: [state.user.id, state.partner?.id || state.user.id], // Чередуем игроков
    filledParts: [],
    isPartnerTurn: false // Первым начинает текущий пользователь
  };
  
  // Показываем игровой экран
  renderStoryGame();
}

// Рендер игрового экрана
function renderStoryGame() {
  const game = state.games.collaborativeStory;
  if (!game.isPlaying || !game.currentStory) return;
  
  const modalBody = document.getElementById('modalBody');
  
  // Разбиваем шаблон на части по предложениям с пропусками
  const sentences = game.currentStory.template.split(/[.!?]+[)]*\s*/).filter(s => s.trim());
  
  // Находим текущее предложение с пропуском
  let currentSentence = "";
  let foundCurrent = false;
  let currentIndex = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].includes('[пропуск]')) {
      if (game.filledParts.length === currentIndex) {
        currentSentence = sentences[i];
        foundCurrent = true;
        break;
      }
      currentIndex++;
    }
  }
  
  if (!foundCurrent) {
    // Если не нашли пропуск - значит все заполнено
    endStoryGame();
    return;
  }
  
  // Разбиваем текущее предложение на части
  const parts = currentSentence.split('[пропуск]');
  
  // Определяем, чей сейчас ход
  const currentPlayer = game.isPartnerTurn ? state.partner?.name || 'Партнёр' : state.user.name;
  
  modalBody.innerHTML = `
    <h3>Совместный рассказ: ${game.currentStory.title}</h3>
    <p>Сейчас заполняет: <strong>${currentPlayer}</strong></p>
    <div class="story-container">
      <div class="current-sentence">
        ${parts[0]}
        <div class="current-part">
          <textarea id="currentPartInput" placeholder="Заполните пропуск..."></textarea>
        </div>
        ${parts[1] || ''}
      </div>
    </div>
    <button id="submitPartBtn" class="btn-primary">Отправить</button>
  `;
  
  // Добавляем обработчик отправки части
  document.getElementById('submitPartBtn')?.addEventListener('click', submitStoryPart);
}

// Обработка отправки части рассказа
function submitStoryPart() {
  const input = document.getElementById('currentPartInput');
  const text = input.value.trim();
  
  if (!text) {
    showNotification('Пожалуйста, заполните пропуск');
    return;
  }
  
  const game = state.games.collaborativeStory;
  
  // Добавляем заполненную часть
  game.filledParts.push(text);
  game.currentPart++;
  game.isPartnerTurn = !game.isPartnerTurn;
  
  // Проверяем, закончена ли игра
  if (game.filledParts.length === game.currentStory.template.split('[пропуск]').length - 1) {
    endStoryGame();
  } else {
    // Продолжаем игру
    renderStoryGame();
  }
}

// Завершение игры
function endStoryGame() {
  const game = state.games.collaborativeStory;
  if (!game.isPlaying || !game.currentStory) return;
  
  // Собираем полный рассказ
  const parts = game.currentStory.template.split('[пропуск]');
  let fullStory = '';
  for (let i = 0; i < parts.length; i++) {
    fullStory += parts[i];
    if (i < game.filledParts.length) {
      fullStory += game.filledParts[i];
    }
  }
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Ваш совместный рассказ</h3>
    <div class="completed-story">
      <p>${fullStory}</p>
    </div>
    <div class="story-actions">
      <button id="playAgainBtn" class="btn-secondary">Играть снова</button>
    </div>
  `;
  
  // Обработчики кнопок
  document.getElementById('playAgainBtn')?.addEventListener('click', () => {
    showStoryGameModal();
  });
}

// Инициализация игры
function initializeStoryGame() {
  // Обработчик закрытия модального окна
  document.querySelector('#modal .close')?.addEventListener('click', () => {
    state.games.collaborativeStory.isPlaying = false;
  });
}

// Кто я?
function getCategoryDisplayName(category) {
  const names = {
    all: "Все категории",
    animals: "Животные",
    professions: "Профессии",
    food: "Еда",
    sports: "Спорт",
    technologies: "Техника",
    brands: "Бренды",
    music: "Жанр музыки",
    games: "Настольные игры"
  };
  return names[category] || category;
}

function showWhoAmIGameModal() {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  
  // Создаем опции для выбора категорий
  const categoryOptions = Object.keys(gameCategories)
    .map(category => `<option value="${category}">${getCategoryDisplayName(category)}</option>`)
    .join('');
  
  // Вставляем содержимое игры в модальное окно
  modalBody.innerHTML = `
    <div id="whoAmIGameContent">
      <!-- Экран настройки -->
      <div id="whoAmISetup" class="game-screen">
        <h3>Кто я?</h3>
        <p>Угадайте, каким персонажем вы стали!</p>
        
        <select id="whoAmICategory" class="game-select">
          <option value="">Выберите категорию</option>
          ${categoryOptions}
        </select>
        
        <button id="confirmCategoryBtn" class="btn-primary" disabled>Начать игру</button>
      </div>
      
      <!-- Экран раскрытия персонажа -->
      <div id="whoAmIRevealScreen" class="game-screen hidden">
        <p id="revealPlayerText"></p>
        <div id="revealedCharacter" class="character-display hidden"></div>
        <button id="revealCharacterBtn" class="btn-primary"></button>
      </div>
      
      <!-- Игровой экран -->
      <div id="whoAmIGameScreen" class="game-screen hidden">
        <div class="game-header">
          <div>Вопросов: <span id="questionCount">0</span></div>
          <div>Время: <span id="gameTimer">05:00</span></div>
        </div>
        
        <div class="game-log" id="gameLog">
          <div class="log-entry">Игра началась! Угадайте кто вы!</div>
        </div>
        
        <button id="guessCharacterBtn" class="btn-primary guess-btn">Угадали!</button>
      </div>
      
      <!-- Экран результатов -->
      <div id="whoAmIResultScreen" class="game-screen hidden">
        <h3 id="resultTitle"></h3>
        <div id="resultDetails"></div>
        <button id="playAgainBtn" class="btn-primary">Играть снова</button>
      </div>
    </div>
  `;
  
  // Показываем модальное окно
  modal.classList.remove('hidden');
  
  // Инициализируем игру после вставки HTML
  initializeWhoAmIGame();
  
  // Показываем только экран настройки
  document.getElementById('whoAmISetup').classList.remove('hidden');
  document.getElementById('whoAmIRevealScreen').classList.add('hidden');
  document.getElementById('whoAmIGameScreen').classList.add('hidden');
  document.getElementById('whoAmIResultScreen').classList.add('hidden');
  
  // Сбрасываем выбор категории
  document.getElementById('whoAmICategory').value = '';
  document.getElementById('confirmCategoryBtn').disabled = true;
}

function initializeWhoAmIGame() {
  // Обработчики для модального окна
  document.querySelector('#modal .close')?.addEventListener('click', () => {
    document.getElementById('modal').classList.add('hidden');
    resetWhoAmIGame();
  });
  
  // Обработчик выбора категории
  const categorySelect = document.getElementById('whoAmICategory');
  if (categorySelect) {
    categorySelect.addEventListener('change', function() {
      const confirmBtn = document.getElementById('confirmCategoryBtn');
      if (confirmBtn) {
        confirmBtn.disabled = !this.value;
      }
    });
  }
  
  // Начало игры
  const confirmBtn = document.getElementById('confirmCategoryBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', startWhoAmIGame);
  }
  
  // Обработчики для экрана раскрытия персонажа
  const revealBtn = document.getElementById('revealCharacterBtn');
  if (revealBtn) {
    revealBtn.addEventListener('click', handleRevealStep);
  }
    
  const guessBtn = document.getElementById('guessCharacterBtn');
  if (guessBtn) {
    guessBtn.addEventListener('click', () => endWhoAmIGame(true));
  }
  
  // Обработчик для кнопки "Играть снова"
  const playAgainBtn = document.getElementById('playAgainBtn');
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      document.getElementById('whoAmIResultScreen').classList.add('hidden');
      showWhoAmIGameModal();
    });
  }
}

let gameTimer;
let timeLeft = 300; // 5 минут в секундах
let player1Character = null;
let player2Character = null;

function startWhoAmIGame() {
  const category = document.getElementById('whoAmICategory').value;
  
  // Получаем персонажей из выбранной категории
  let characters = [...gameCategories[category]];
  
  // Проверяем, что в категории достаточно персонажей
  if (characters.length < 2) {
    showNotification('В этой категории недостаточно персонажей для игры');
    return;
  }
  
  // Перемешиваем и выбираем двух разных персонажей
  characters = shuffleArray(characters);
  player1Character = characters[0];
  player2Character = characters[1];
  
  state.games.whoAmI.currentCategory = category;
  state.games.whoAmI.questionsAsked = 0;
  state.games.whoAmI.gameStage = 'player1_reveal';
  
  // Очищаем лог игры
  document.getElementById('gameLog').innerHTML = '<div class="log-entry">Игра началась! Угадайте кто вы!</div>';
  
  // Показываем экран раскрытия персонажа
  document.getElementById('whoAmISetup').classList.add('hidden');
  document.getElementById('whoAmIRevealScreen').classList.remove('hidden');
  
  // Устанавливаем текст для первого игрока
  document.getElementById('revealPlayerText').textContent = 'Игрок 1: посмотрите кто вы';
  document.getElementById('revealedCharacter').textContent = player1Character;
  document.getElementById('revealedCharacter').classList.remove('hidden');
  document.getElementById('revealCharacterBtn').textContent = 'Я посмотрел(а)';
}

// Функция для перемешивания массива
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function handleRevealStep() {
  const game = state.games.whoAmI;
  
  if (game.gameStage === 'player1_reveal') {
    // Первый игрок посмотрел
    game.gameStage = 'player1_hide';
    document.getElementById('revealedCharacter').classList.add('hidden');
    document.getElementById('revealPlayerText').textContent = 'Передайте телефон партнёру';
    document.getElementById('revealCharacterBtn').textContent = 'Партнёр готов';
  } 
  else if (game.gameStage === 'player1_hide') {
    // Переход ко второму игроку
    game.gameStage = 'player2_reveal';
    document.getElementById('revealPlayerText').textContent = 'Игрок 2: посмотрите кто вы';
    document.getElementById('revealedCharacter').textContent = player2Character;
    document.getElementById('revealedCharacter').classList.remove('hidden');
  }
  else if (game.gameStage === 'player2_reveal') {
    // Второй игрок посмотрел
    game.gameStage = 'player2_hide';
    document.getElementById('revealedCharacter').classList.add('hidden');
    document.getElementById('revealPlayerText').textContent = 'Начать угадывать!';
    document.getElementById('revealCharacterBtn').textContent = 'Начать игру';
  }
  else if (game.gameStage === 'player2_hide') {
    // Начинаем игру
    startGuessingPhase();
  }
}

function startGuessingPhase() {
  const game = state.games.whoAmI;
  game.gameStage = 'guessing';
  game.startTime = new Date();
  
  // Сбрасываем счетчики
  game.questionsAsked = 0;
  timeLeft = 300;
  updateTimerDisplay();
  
  // Запускаем таймер
  gameTimer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    if (timeLeft <= 0) {
      endWhoAmIGame(false);
    }
  }, 1000);
  
  // Показываем игровой экран
  document.getElementById('whoAmIRevealScreen').classList.add('hidden');
  document.getElementById('whoAmIGameScreen').classList.remove('hidden');
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  document.getElementById('gameTimer').textContent = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function endWhoAmIGame(isSuccess) {
  // Останавливаем таймер
  clearInterval(gameTimer);
  
  const game = state.games.whoAmI;
  const timeSpent = 300 - timeLeft;
  
  // Показываем экран результатов
  document.getElementById('whoAmIGameScreen').classList.add('hidden');
  document.getElementById('whoAmIResultScreen').classList.remove('hidden');
  
  // Заполняем результаты
  if (isSuccess) {
    document.getElementById('resultTitle').textContent = '🎉 Поздравляем! Вы угадали!';
    document.getElementById('resultDetails').innerHTML = `
      <p>Вы: <strong>${player1Character}</strong></p>
      <p>Партнёр: <strong>${player2Character}</strong></p>
      <p>Время: ${Math.floor(timeSpent/60)} мин ${timeSpent%60} сек</p>
    `;
  } else {
    document.getElementById('resultTitle').textContent = '⏱️ Время вышло!';
    document.getElementById('resultDetails').innerHTML = `
      <p>Вы были: <strong>${player1Character}</strong></p>
      <p>Партнёр был: <strong>${player2Character}</strong></p>
    `;
  }
}

function resetWhoAmIGame() {
  // Сбрасываем состояние игры
  state.games.whoAmI = {
    ...state.games.whoAmI,
    isPlaying: false,
    currentCharacter: null,
    currentCategory: null,
    questionsAsked: 0,
    gameStage: null
  };
  
  // Сбрасываем персонажей
  player1Character = null;
  player2Character = null;
  
  // Останавливаем таймер, если он был
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  
  // Сбрасываем UI
  document.getElementById('whoAmICategory').value = '';
  document.getElementById('confirmCategoryBtn').disabled = true;
  document.getElementById('questionCount').textContent = '0';
  document.getElementById('gameTimer').textContent = '05:00';
}


// ==================== Modal & Notification ====================
function initializeModal() {
  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', () => hideModal('authModal'));
  });
  document.getElementById('showLoginBtn')?.addEventListener('click', () => showAuthModal('login'));
  document.getElementById('showRegisterBtn')?.addEventListener('click', () => showAuthModal('register'));
}

function showAuthModal(tab = 'login') {
  document.getElementById('authModal').classList.remove('hidden');
}

function switchAuthTab(tabName) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.auth-form').forEach(form => {
    form.classList.toggle('active', form.id === `${tabName}Form`);
  });
}

function hideModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

function initializeNotification() {
  document.getElementById('closeNotification')?.addEventListener('click', hideNotification);
}

function showNotification(message) {
  const notif = document.getElementById('notification');
  document.getElementById('notificationText').textContent = message;
  notif.classList.remove('hidden');
  setTimeout(hideNotification, 3000);
}

function hideNotification() {
  document.getElementById('notification')?.classList.add('hidden');
}

// ==================== Calendar Section ====================
function initializeCalendar() {
  // Инициализация календаря
  renderCalendar();
  
  // Обработчики для навигации по месяцам
  document.getElementById('prevMonth')?.addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    renderCalendar();
  });
  
  document.getElementById('nextMonth')?.addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    renderCalendar();
  });
  
  // Обработчик для добавления события
  document.getElementById('addEventBtn')?.addEventListener('click', showAddEventModal);
  
  // Загрузка событий
  loadEvents();
}

function renderCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  if (!calendarGrid) return;
  
  calendarGrid.innerHTML = '';
  
  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  document.getElementById('currentMonth').textContent = 
    `${monthNames[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;
  
  // Получаем первый день месяца и количество дней в месяце
  const firstDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const lastDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  
  // Определяем день недели первого дня месяца (0 - воскресенье, 1 - понедельник и т.д.)
  let startingDay = firstDay.getDay();
  // Корректируем для отображения понедельника первым днем
  if (startingDay === 0) startingDay = 7;
  
  // Добавляем пустые ячейки для дней предыдущего месяца
  for (let i = 1; i < startingDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyCell);
  }
  
  // Добавляем ячейки для дней текущего месяца
  for (let i = 1; i <= daysInMonth; i++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = i;
    
    // Проверяем, есть ли события в этот день
    const currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), i);
    const eventsForDay = state.events?.filter(event => {
      const eventDate = event.date instanceof Date ? event.date : event.date.toDate();
      return eventDate.toDateString() === currentDate.toDateString();
    });
    
    if (eventsForDay?.length > 0) {
      dayCell.classList.add('has-events');
      
      // Добавляем индикатор событий
      const eventIndicator = document.createElement('div');
      eventIndicator.className = 'event-indicator';
      eventIndicator.textContent = eventsForDay.length;
      dayCell.appendChild(eventIndicator);
    }
    
    // Обработчик клика по дню
    dayCell.addEventListener('click', () => showDayEvents(currentDate));
    
    calendarGrid.appendChild(dayCell);
  }
}

async function loadEvents() {
  if (!state.isAuthenticated || !state.user.coupleId) {
    state.events = [];
    renderUpcomingEvents();
    return;
  }
  
  try {
    const eventsRef = collection(db, "couples", state.user.coupleId, "events");
    const q = query(eventsRef, orderBy("date"));
    const querySnapshot = await getDocs(q);
    
    // Преобразуем Timestamp в Date и сохраняем в state
    state.events = querySnapshot.docs.map(doc => {
      const eventData = doc.data();
      return {
        id: doc.id,
        ...eventData,
        date: eventData.date.toDate() // Конвертируем Firestore Timestamp в JavaScript Date
      };
    });
    
    renderUpcomingEvents();
    renderCalendar(); // Добавляем перерисовку календаря
  } catch (error) {
    console.error("Error loading events:", error);
    showNotification('Ошибка загрузки событий');
    state.events = [];
    renderUpcomingEvents();
    renderCalendar(); // Добавляем перерисовку календаря даже при ошибке
  }
}

function renderUpcomingEvents() {
  const eventsList = document.getElementById('eventsList');
  if (!eventsList) return;
  
  eventsList.innerHTML = '';
  
  if (!state.events || state.events.length === 0) {
    eventsList.innerHTML = '<p>Нет предстоящих событий</p>';
    return;
  }
  
  // Фильтруем события, оставляя только будущие или сегодняшние
  const now = new Date();
  const upcomingEvents = state.events
    .filter(event => {
      const eventDate = event.date instanceof Date ? event.date : event.date.toDate();
      return eventDate >= now;
    })
    .sort((a, b) => a.date - b.date) // Сортируем по дате
    .slice(0, 5); // Показываем только 5 ближайших событий
  
  if (upcomingEvents.length === 0) {
    eventsList.innerHTML = '<p>Нет предстоящих событий</p>';
    return;
  }
  
  upcomingEvents.forEach(event => {
    const eventDate = event.date instanceof Date ? event.date : event.date.toDate();
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.dataset.id = event.id;
    
    eventItem.innerHTML = `
      <div class="event-date">${eventDate.toLocaleDateString()}</div>
      <div class="event-time">${eventDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      <div class="event-title">${event.title}</div>
      <div class="event-actions">
        <button class="btn-icon view-event-btn" data-id="${event.id}">👁️</button>
        <button class="btn-icon delete-event-btn" data-id="${event.id}">🗑️</button>
      </div>
    `;
    
    eventsList.appendChild(eventItem);
  });
  
  // Добавляем обработчики для кнопок
  document.querySelectorAll('.view-event-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.id;
      const event = state.events.find(e => e.id === eventId);
      if (event) showEventDetails(event);
    });
  });
  
  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.id;
      deleteEvent(eventId);
    });
  });
}

function showAddEventModal() {
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Добавить новое событие</h3>
    <form id="addEventForm">
      <div class="form-group">
        <label for="eventTitle">Название</label>
        <input type="text" id="eventTitle" required>
      </div>
      <div class="form-group">
        <label for="eventDate">Дата</label>
        <input type="date" id="eventDate" required>
      </div>
      <div class="form-group">
        <label for="eventTime">Время</label>
        <input type="time" id="eventTime" required>
      </div>
      <div class="form-group">
        <label for="eventDescription">Описание</label>
        <textarea id="eventDescription"></textarea>
      </div>
      <button type="submit" class="btn-primary">Добавить событие</button>
    </form>
  `;
  
  // Устанавливаем минимальную дату (сегодня)
  document.getElementById('eventDate').min = new Date().toISOString().split('T')[0];
  
  document.getElementById('addEventForm')?.addEventListener('submit', handleAddEvent);
  document.getElementById('modal').classList.remove('hidden');
}

async function handleAddEvent(e) {
  e.preventDefault();
  
  const title = document.getElementById('eventTitle').value.trim();
  const date = document.getElementById('eventDate').value;
  const time = document.getElementById('eventTime').value;
  const description = document.getElementById('eventDescription').value.trim();
  
  if (!title || !date || !time) {
    showNotification('Пожалуйста, заполните обязательные поля');
    return;
  }
  
  // Собираем полную дату и время
  const [year, month, day] = date.split('-');
  const [hours, minutes] = time.split(':');
  const eventDate = new Date(year, month - 1, day, hours, minutes);
  
  try {
    const eventData = {
      title,
      date: eventDate,
      description,
      createdAt: new Date(),
      createdBy: state.user.id
    };
    
    // Используем импортированные addDoc и collection
    const eventRef = await addDoc(
      collection(db, "couples", state.user.coupleId, "events"), 
      eventData
    );
    
    showNotification('Событие добавлено!');
    hideModal('modal');
    await loadEvents(); // Перезагружаем события
  } catch (error) {
    console.error("Error adding event:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

function showDayEvents(date) {
  const eventsForDay = state.events?.filter(event => {
    const eventDate = event.date.toDate ? event.date.toDate() : new Date(event.date);
    return eventDate.toDateString() === date.toDateString();
  });
  
  if (!eventsForDay || eventsForDay.length === 0) {
    showNotification('Нет событий на этот день');
    return;
  }
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>События на ${date.toLocaleDateString()}</h3>
    <div class="day-events-list" id="dayEventsList"></div>
  `;
  
  const dayEventsList = document.getElementById('dayEventsList');
  
  eventsForDay.forEach(event => {
    const eventDate = event.date.toDate ? event.date.toDate() : new Date(event.date);
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.dataset.id = event.id;
    
    eventItem.innerHTML = `
      <div class="event-time">${eventDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      <div class="event-title">${event.title}</div>
      <div class="event-actions">
        <button class="btn-icon view-event-btn" data-id="${event.id}">👁️</button>
        <button class="btn-icon delete-event-btn" data-id="${event.id}">🗑️</button>
      </div>
    `;
    
    dayEventsList.appendChild(eventItem);
  });
  
  // Добавляем обработчики для кнопок
  document.querySelectorAll('.view-event-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.id;
      const event = state.events.find(e => e.id === eventId);
      if (event) showEventDetails(event);
    });
  });
  
  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.id;
      deleteEvent(eventId);
    });
  });
  
  document.getElementById('modal').classList.remove('hidden');
}

function showEventDetails(event) {
  const eventDate = event.date.toDate ? event.date.toDate() : new Date(event.date);
  const createdBy = event.createdBy === state.user.id ? 'Вы' : (state.partner?.name || 'Партнёр');
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>${event.title}</h3>
    <div class="event-details">
      <div><strong>Дата:</strong> ${eventDate.toLocaleDateString()}</div>
      <div><strong>Время:</strong> ${eventDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      ${event.description ? `<div><strong>Описание:</strong> ${event.description}</div>` : ''}
      <div><small>Добавлено: ${createdBy}</small></div>
    </div>
    <div class="modal-actions">
      <button id="editEventBtn" class="btn-secondary" data-id="${event.id}">Редактировать</button>
      <button id="deleteEventBtn" class="btn-secondary" data-id="${event.id}">Удалить</button>
      <button id="closeEventBtn" class="btn-primary">Закрыть</button>
    </div>
  `;
  
  document.getElementById('editEventBtn')?.addEventListener('click', () => showEditEventModal(event));
  document.getElementById('deleteEventBtn')?.addEventListener('click', () => deleteEvent(event.id));
  document.getElementById('closeEventBtn')?.addEventListener('click', () => hideModal('modal'));
  
  document.getElementById('modal').classList.remove('hidden');
}

function showEditEventModal(event) {
  const eventDate = event.date.toDate ? event.date.toDate() : new Date(event.date);
  const dateStr = eventDate.toISOString().split('T')[0];
  const timeStr = `${eventDate.getHours().toString().padStart(2, '0')}:${eventDate.getMinutes().toString().padStart(2, '0')}`;
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Редактировать событие</h3>
    <form id="editEventForm">
      <div class="form-group">
        <label for="editEventTitle">Название</label>
        <input type="text" id="editEventTitle" value="${event.title}" required>
      </div>
      <div class="form-group">
        <label for="editEventDate">Дата</label>
        <input type="date" id="editEventDate" value="${dateStr}" required>
      </div>
      <div class="form-group">
        <label for="editEventTime">Время</label>
        <input type="time" id="editEventTime" value="${timeStr}" required>
      </div>
      <div class="form-group">
        <label for="editEventDescription">Описание</label>
        <textarea id="editEventDescription">${event.description || ''}</textarea>
      </div>
      <input type="hidden" id="editEventId" value="${event.id}">
      <button type="submit" class="btn-primary">Сохранить</button>
    </form>
  `;
  
  document.getElementById('editEventForm')?.addEventListener('submit', handleEditEvent);
  document.getElementById('modal').classList.remove('hidden');
}

async function handleEditEvent(e) {
  e.preventDefault();
  
  const eventId = document.getElementById('editEventId').value;
  const title = document.getElementById('editEventTitle').value.trim();
  const date = document.getElementById('editEventDate').value;
  const time = document.getElementById('editEventTime').value;
  const description = document.getElementById('editEventDescription').value.trim();
  
  if (!title || !date || !time) {
    showNotification('Пожалуйста, заполните обязательные поля');
    return;
  }
  
  // Собираем полную дату и время
  const [year, month, day] = date.split('-');
  const [hours, minutes] = time.split(':');
  const eventDate = new Date(year, month - 1, day, hours, minutes);
  
  try {
    const eventRef = doc(db, "couples", state.user.coupleId, "events", eventId);
    await updateDoc(eventRef, {
      title,
      date: eventDate,
      description
    });
    
    showNotification('Событие обновлено!');
    hideModal('modal');
    await loadEvents(); // Перезагружаем события
  } catch (error) {
    console.error("Error editing event:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

async function deleteEvent(eventId) {
  if (!confirm('Вы уверены, что хотите удалить это событие?')) {
    return;
  }
  
  try {
    await deleteDoc(doc(db, "couples", state.user.coupleId, "events", eventId));
    showNotification('Событие удалено');
    await loadEvents(); // Перезагружаем события
    hideModal('modal');
  } catch (error) {
    console.error("Error deleting event:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

// Добавим вызов инициализации в DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // ... существующий код ...
  initializeCalendar();
});

// ==================== Memories Album ====================
function initializeMemories() {
  document.getElementById('uploadMemoryBtn')?.addEventListener('click', showUploadMemoryModal);
  if (state.isAuthenticated && state.user?.coupleId) {
    loadMemories();
  }
}

async function loadMemories() {
  if (!state.isAuthenticated || !state.user?.coupleId) {
    state.memories.photos = [];
    renderMemories();
    return;
  }

  try {
    const { success, memories, error } = await memoriesService.getMemories(state.user.coupleId);
    if (success) {
      state.memories.photos = memories;
      renderMemories();
      localStorage.setItem(`memories_${state.user.coupleId}`, JSON.stringify(memories));
    } else {
      showNotification(`Ошибка загрузки: ${error}`);
      state.memories.photos = [];
      renderMemories();
    }
  } catch (error) {
    console.error("Load memories error:", error);
    showNotification('Ошибка загрузки воспоминаний');
    state.memories.photos = [];
    renderMemories();
  }
}

async function handleEditMemory(e) {
  e.preventDefault();
  
  const memoryId = document.getElementById('editMemoryId').value;
  const date = document.getElementById('editMemoryDate').value;
  const description = document.getElementById('editMemoryDescription').value.trim();

  try {
    const updates = {
      description,
      date: date ? new Date(date) : new Date()
    };

    const { success, error } = await memoriesService.updateMemory(
      state.user.coupleId,
      memoryId,
      updates
    );

    if (success) {
      showNotification('Изменения сохранены!');
      hideModal('modal');
      await loadMemories();
    } else {
      showNotification(`Ошибка: ${error}`);
    }
  } catch (error) {
    console.error("Edit memory error:", error);
    showNotification(`Ошибка: ${error.message}`);
  }
}

function renderMemories() {
  const memoriesContainer = document.getElementById('memoriesContainer');
  if (!memoriesContainer) return;

  // Clear previous content
  memoriesContainer.innerHTML = '';

  // Show message if no photos
  if (!state.memories.photos || state.memories.photos.length === 0) {
    memoriesContainer.innerHTML = '<p class="no-memories">Пока нет воспоминаний. Добавьте первое фото!</p>';
    return;
  }

  // Create grid
  const grid = document.createElement('div');
  grid.className = 'memories-grid';

  // Add each photo
  state.memories.photos.forEach(photo => {
    // Skip if no URL
    if (!photo.url) return;

    const photoDate = photo.date?.toDate ? photo.date.toDate() : new Date(photo.date);
    
    const photoElement = document.createElement('div');
    photoElement.className = 'memory-item';
    photoElement.dataset.id = photo.id;
    
    // Use img tag instead of background-image for better mobile support
    photoElement.innerHTML = `
      <div class="memory-photo">
        <img src="${photo.url}" alt="Воспоминание" 
            onerror="this.src='https://via.placeholder.com/300x300?text=Photo+Not+Found'">
      </div>
      <div class="memory-info">
        <div class="memory-date">${photoDate.toLocaleDateString()}</div>
        ${photo.description ? `<div class="memory-description">${photo.description}</div>` : ''}
      </div>
    `;

    photoElement.querySelector('.edit-memory-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showEditMemoryModal(photo.id);
    });
    
    photoElement.addEventListener('click', () => viewMemory(photo.id));
    grid.appendChild(photoElement);
  });

  memoriesContainer.appendChild(grid);
}

function showEditMemoryModal(memoryId) {
  const memory = state.memories.photos.find(m => m.id === memoryId);
  if (!memory) return;

  const memoryDate = memory.date?.toDate ? memory.date.toDate() : new Date(memory.date);
  const dateStr = memoryDate.toISOString().split('T')[0];

  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Редактировать воспоминание</h3>
    <form id="editMemoryForm">
      <div class="memory-photo-preview">
        <img src="${memory.url}" alt="Предпросмотр">
      </div>
      <div class="form-group">
        <label for="editMemoryDate">Дата</label>
        <input type="date" id="editMemoryDate" value="${dateStr}">
      </div>
      <div class="form-group">
        <label for="editMemoryDescription">Описание</label>
        <textarea id="editMemoryDescription">${memory.description || ''}</textarea>
      </div>
      <input type="hidden" id="editMemoryId" value="${memory.id}">
      <div class="modal-actions">
        <button type="submit" class="btn-primary">Сохранить</button>
        <button type="button" id="cancelEditMemoryBtn" class="btn-secondary">Отмена</button>
      </div>
    </form>
  `;

  document.getElementById('editMemoryForm')?.addEventListener('submit', handleEditMemory);
  document.getElementById('cancelEditMemoryBtn')?.addEventListener('click', () => hideModal('modal'));
  document.getElementById('modal').classList.remove('hidden');
}

function viewMemory(photoId) {
  const photo = state.memories.photos.find(p => p.id === photoId);
  if (!photo) return;

  state.memories.selectedPhoto = photo;
  
  const photoDate = photo.date?.toDate ? photo.date.toDate() : new Date(photo.date);
  const createdBy = photo.authorId === state.user.id ? 'Вы' : (state.partner?.name || 'Партнёр');
  
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <div class="memory-view">
      <div class="memory-photo-large">
        <img src="${photo.url}" alt="Воспоминание" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x300?text=Photo+Not+Found';">
      </div>
      <div class="memory-details">
        <div class="memory-date">${photoDate.toLocaleDateString()}</div>
        ${photo.description ? `<div class="memory-description">${photo.description}</div>` : ''}
      </div>
      <div class="memory-actions">
        ${photo.authorId === state.user.id ? 
          `<button class="btn-secondary" id="editMemoryBtn" data-id="${photo.id}">Редактировать</button>` : ''}
        ${photo.authorId === state.user.id ? 
          `<button class="btn-secondary" id="deleteMemoryBtn" data-id="${photo.id}">Удалить</button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('editMemoryBtn')?.addEventListener('click', () => showEditMemoryModal(photo.id));
  document.getElementById('deleteMemoryBtn')?.addEventListener('click', () => deleteMemory(photo.id));
  document.getElementById('modal').classList.remove('hidden');
}

function showUploadMemoryModal() {
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h3>Добавить воспоминание</h3>
    <form id="uploadMemoryForm">
      <div class="form-group">
        <label for="memoryPhoto">Фото</label>
        <input type="file" id="memoryPhoto" accept="image/*" required>
      </div>
      <div class="form-group">
        <label for="memoryDate">Дата</label>
        <input type="date" id="memoryDate">
      </div>
      <div class="form-group">
        <label for="memoryDescription">Описание</label>
        <textarea id="memoryDescription" placeholder="Добавьте описание (необязательно)"></textarea>
      </div>
      <button type="submit" class="btn-primary">Добавить</button>
    </form>
  `;

  // Устанавливаем сегодняшнюю дату по умолчанию
  document.getElementById('memoryDate').value = new Date().toISOString().split('T')[0];
  
  document.getElementById('uploadMemoryForm')?.addEventListener('submit', handleMemoryUpload);
  document.getElementById('modal').classList.remove('hidden');
}

async function handleMemoryUpload(e) {
  e.preventDefault();
  
  const fileInput = document.getElementById('memoryPhoto');
  const dateInput = document.getElementById('memoryDate');
  const descriptionInput = document.getElementById('memoryDescription');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    showNotification('Пожалуйста, выберите фото');
    return;
  }
  
  const file = fileInput.files[0];
  const date = dateInput.value ? new Date(dateInput.value) : new Date();
  const description = descriptionInput.value.trim();

  // Показываем индикатор загрузки
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Загрузка...';
  submitBtn.disabled = true;

  try {
    const { success, error } = await memoriesService.uploadMemory(
      state.user.coupleId,
      file,
      date,
      description
    );
    
    if (success) {
      showNotification('Фото добавлено в альбом!');
      hideModal('modal');
      await loadMemories();
    } else {
      showNotification(`Ошибка: ${error}`);
    }
  } catch (error) {
    console.error("Upload error:", error);
    showNotification(`Ошибка: ${error.message}`);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function deleteMemory(memoryId) {
  if (!confirm('Вы уверены, что хотите удалить это воспоминание?')) {
    return;
  }
  
  try {
    const { success, error } = await memoriesService.deleteMemory(
      state.user.coupleId,
      memoryId
    );
    
    if (success) {
      showNotification('Воспоминание удалено');
      hideModal('modal');
      await loadMemories();
      // Обновляем localStorage после удаления
      localStorage.setItem(`memories_${state.user.coupleId}`, JSON.stringify(state.memories.photos));
    } else {
      showNotification(`Ошибка: ${error}`);
    }
  } catch (error) {
    showNotification(`Ошибка: ${error.message}`);
  }
}