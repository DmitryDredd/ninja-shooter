// Автоматическое подключение к текущему серверу через безопасный протокол (WSS)
const socket = io(); 
socket.on('connect', () => {
    console.log("✅ СОЕДИНЕНИЕ УСТАНОВЛЕНО! Мой ID:", socket.id);
    const statusBox = document.getElementById('status');
    if (statusBox) statusBox.innerText = "Ниндзя в сети";
});

socket.on('connect_error', (err) => {
    console.error("❌ ОШИБКА СОЕДИНЕНИЯ:", err.message);
    const statusBox = document.getElementById('status');
    if (statusBox) statusBox.innerText = "Ошибка сети: " + err.message;
});

// Остальные твои переменные
let scene, camera, renderer;
let playerMeshes = {};
let myPlayerId;
let healthDisplay = document.getElementById('health');
let chatInput = document.getElementById('messageInput');
let messagesList = document.getElementById('messages');
let isPointerLocked = false;
let weaponModel;
let players = {};
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let lastLog = 0;

function init() {
    // 1. Создаем сцену и темный фон (в стиле твоего менеджера)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020202); 

    // 2. Камера: поднимаем на 1.6м и ставим правильный порядок вращения
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5); 
    camera.rotation.order = 'YXZ'; // Критично для FPS!

    // 3. Рендерер с антиалиасингом (чтобы не было "лесенок" на краях)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 4. СВЕТ: теперь мир станет объемным
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Общий мягкий свет
    scene.add(ambientLight);

    const ninjaLight = new THREE.PointLight(0x00ff88, 1, 100); // Зеленый неоновый свет
    ninjaLight.position.set(5, 10, 5);
    scene.add(ninjaLight);

    // 5. СЕТКА ПОЛА: чтобы видеть скорость и направление движения
    const grid = new THREE.GridHelper(100, 50, 0x00ff88, 0x222222);
    scene.add(grid);

    // 6. Создание карты (стен и препятствий)
    createMap();

    // 7. Обработка нажатий клавиш (W, A, S, D)
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // 8. Управление мышью (Pointer Lock уже внутри твоего общего клика)
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove, false);

    // 9. Присоединение к команде (через confirm, чтобы не мучить пользователя prompt)
    const team = confirm("Вступить в КРАСНЫЙ ОТРЯД? (Отмена - СИНИЕ)") ? 'red' : 'blue';
    socket.emit('joinTeam', team);

    // 10. Запуск анимации
    loadWeaponModel();
    animate();
}


function createMap() {
    const planeGeometry = new THREE.PlaneGeometry(10, 10);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(plane);

    // Препятствия
    for (let i = 0; i < 10; i++) {
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.set(Math.random() * 10 - 5, 0.5, Math.random() * 10 - 5);
        scene.add(box);
    }
}

function animate() {
    requestAnimationFrame(animate);

    // 1. ЛОГИ И СОСТОЯНИЕ (Твой дебаг-блок)
    if (isPointerLocked) {
        if (Date.now() - (window.lastLog || 0) > 1000) {
            console.log(`[ДВИЖЕНИЕ]: W:${moveForward} S:${moveBackward} A:${moveLeft} D:${moveRight}`);
            console.log(`[КООРДИНАТЫ]: X:${camera.position.x.toFixed(2)} Z:${camera.position.z.toFixed(2)}`);
            console.log(`[DEBUG]: MyID: ${myPlayerId} | Im Alive: ${players[myPlayerId] ? 'YES' : 'NO'}`);
            window.lastLog = Date.now();
        } 
    }

    // 2. ЛОГИКА ТВОЕГО ДВИЖЕНИЯ
    if (isPointerLocked && players[myPlayerId] && players[myPlayerId].health > 0) {
        const speed = 0.15; 
        
        if (moveForward) camera.translateZ(-speed);
        if (moveBackward) camera.translateZ(speed);
        if (moveLeft) camera.translateX(-speed);
        if (moveRight) camera.translateX(speed);
        
        camera.position.y = 1.6;

        if (typeof sendPlayerMove === 'function') {
            sendPlayerMove();
        }
    }

    // 3. ОБНОВЛЕНИЕ ПОЗИЦИЙ ДРУГИХ ИГРОКОВ
    for (const playerId in playerMeshes) {
        if (playerId !== myPlayerId && players[playerId]) {
            const targetPosition = new THREE.Vector3(
                players[playerId].position.x, 
                players[playerId].position.y,
                players[playerId].position.z
            );
            
            playerMeshes[playerId].position.lerp(targetPosition, 0.1);

            if (players[playerId].rotation) {
                const targetRotation = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(players[playerId].rotation.x, players[playerId].rotation.y, players[playerId].rotation.z)
                );
                playerMeshes[playerId].quaternion.slerp(targetRotation, 0.1);
            }
        }
    }

    // 4. ФИНАЛЬНАЯ ОТРИСОВКА СЦЕНЫ (Один раз в самом конце!)
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}


function handleKeyDown(event) {
	console.log(`[КЛАВИША НАЖАТА]: ${event.code} | В игре: ${isPointerLocked}`);
    // Используем code вместо key, чтобы работало на любой раскладке (даже русской)
    switch(event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function handleKeyUp(event) {
    switch(event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function requestPointerLock() {
    document.body.requestPointerLock();
}

function onPointerLockChange() {
    isPointerLocked = (document.pointerLockElement === document.body);
    console.log(`[STATUS]: Управление активно: ${isPointerLocked}`);
    if (isPointerLocked) {
        console.warn("🎯 НИНДЗЯ В ГРЕ! Попробуй нажать W");
    }
}

let yaw = 0, pitch = 0;

function onMouseMove(event) {
    if (isPointerLocked && players[myPlayerId] && players[myPlayerId].health > 0) {
        yaw -= event.movementX * 0.002;
        pitch -= event.movementY * 0.002;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        const player = players[myPlayerId];
        if (player) {
            player.rotation = { x: pitch, y: yaw };
        }
    }
}

let lastSentTime = 0;

function sendPlayerMove() {
    const now = Date.now();
    if (now - lastSentTime > 50) { // Отправка каждые 20 раз в секунду
        lastSentTime = now;
        socket.emit('playerMove', { position: camera.position, rotation: { x: pitch, y: yaw } });
    }
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message && players[myPlayerId] && players[myPlayerId].health > 0) {
        socket.emit('chatMessage', message);
        chatInput.value = '';
    }
}

socket.on('updatePlayers', (data) => {
    players = data;
    
    // ФИКС №1: Сразу запоминаем свой ID из сокета, чтобы логика движения ожила
    myPlayerId = socket.id; 

    for (const playerId in players) {
        const p = players[playerId];

        // ФИКС №2: Проверка на наличие позиции (чтобы не было ошибок в консоли)
        if (!p.position) continue;

        // Создаем меш (тело) игрока, если его еще нет на сцене
        if (!playerMeshes[playerId]) {
            console.log(`[SYSTEM]: Новый игрок в кадре: ${playerId}`);
            const geometry = new THREE.BoxGeometry(1, 2, 1); // Делаем игрока ростом в 2 метра
            const material = new THREE.MeshBasicMaterial({ 
                color: p.team === 'red' ? 0xff0000 : 0x0000ff 
            });
            playerMeshes[playerId] = new THREE.Mesh(geometry, material);
            scene.add(playerMeshes[playerId]);
        }

        // Логика разделения: Чужие игроки / Твой интерфейс
        if (playerId !== myPlayerId) {
            // Плавное перемещение чужих игроков к их координатам на сервере
            const targetPos = new THREE.Vector3(p.position.x, p.position.y, p.position.z);
            playerMeshes[playerId].position.lerp(targetPos, 0.2);
            
            // Если сервер прислал поворот — поворачиваем меш
            if (p.rotation) {
                playerMeshes[playerId].rotation.y = p.rotation.y;
            }
        } else {
            // Обновляем ТВОЙ интерфейс (HP)
            if (healthDisplay) {
                healthDisplay.textContent = `Health: ${p.health}`;
            }
        }
    }
});


socket.on('bulletFired', ({ shooterId, targetPosition }) => {
    if (playerMeshes[shooterId]) {
        const bulletGeometry = new THREE.SphereGeometry(0.1, 32, 32);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.copy(playerMeshes[shooterId].position);
        scene.add(bullet);

        // Простая анимация пули
        setTimeout(() => {
            scene.remove(bullet);
        }, 1000);
    }
});

socket.on('playerKilled', ({ killerId, victimId }) => {
    if (playerMeshes[victimId]) {
        scene.remove(playerMeshes[victimId]);
        delete playerMeshes[victimId];
    }
});

socket.on('chatMessage', (message) => {
    const li = document.createElement('li');
    li.textContent = message;
    messagesList.appendChild(li);
    chatInput.focus();
});



// Ограничение частоты отправки данных
setInterval(sendPlayerMove, 50);

// Звук выстрела
// Звук выстрела (оставляем только одну строку)
const shootSound = new Audio('ak47-1.wav'); 

document.addEventListener('click', () => {
    // Шаг 1: Входим в игру
	console.log(`[КЛИК]: Захват мыши был: ${isPointerLocked}`);
    if (!isPointerLocked) {
        document.body.requestPointerLock();
        return; 
    }

    // Шаг 2: Стреляем
    if (players[myPlayerId] && players[myPlayerId].health > 0) {
        const targetPosition = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
        targetPosition.add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
        
        socket.emit('shoot', { targetPosition });

        // Бабахаем из USP
        shootSound.currentTime = 0; 
        shootSound.play();
    }
});



// Коллизии (простая проверка)
function checkCollisions() {
    for (const playerId in players) {
        if (playerId !== myPlayerId && players[playerId]) {
            const playerPosition = new THREE.Vector3(players[playerId].position.x, players[playerId].position.y,
players[playerId].position.z);
            const distance = camera.position.distanceTo(playerPosition);
            if (distance < 1.5) { // Простая проверка на столкновение
                return true;
            }
        }
    }
    return false;
}

// Мобильное управление
const joystickContainer = document.querySelector('.joystick-container');
const touchArea = document.querySelector('.touch-area');

let joystickPosition = { x: 0, y: 0 };
let touchStartX, touchStartY;

joystickContainer.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
});

joystickContainer.addEventListener('touchmove', (event) => {
    if (!isPointerLocked) {
        const touch = event.touches[0];
        joystickPosition.x = touch.clientX - touchStartX;
        joystickPosition.y = touch.clientY - touchStartY;

        // Ограничение движения джойстика
        const maxDistance = 50;
        const distance = Math.sqrt(joystickPosition.x * joystickPosition.x + joystickPosition.y *
joystickPosition.y);
        if (distance > maxDistance) {
            joystickPosition.x *= maxDistance / distance;
            joystickPosition.y *= maxDistance / distance;
        }

        // Обновление позиции джойстика
        const joystick = document.createElement('div');
        joystick.style.position = 'absolute';
        joystick.style.width = '20px';
        joystick.style.height = '20px';
        joystick.style.backgroundColor = 'red';
        joystick.style.borderRadius = '50%';
        joystick.style.left = `${joystickPosition.x + 40}px`;
        joystick.style.top = `${joystickPosition.y + 40}px`;
        joystickContainer.innerHTML = '';
        joystickContainer.appendChild(joystick);

        // Обработка движения
        moveForward = joystickPosition.y < -20;
        moveBackward = joystickPosition.y > 20;
        moveLeft = joystickPosition.x < -20;
        moveRight = joystickPosition.x > 20;
    }
});

joystickContainer.addEventListener('touchend', () => {
    if (!isPointerLocked) {
        joystickPosition = { x: 0, y: 0 };
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
        joystickContainer.innerHTML = '';
    }
});

touchArea.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
});

touchArea.addEventListener('touchmove', (event) => {
    if (!isPointerLocked) {
        const touch = event.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        yaw -= deltaX * 0.01;
        pitch -= deltaY * 0.01;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        const player = players[myPlayerId];
        if (player) {
            player.rotation = { x: pitch, y: yaw };
        }

        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }
});

// Загрузка 3D-моделей игроков
const loader = new THREE.GLTFLoader();

function loadPlayerModel(playerId) {
    loader.load('path/to/player-model.glb', (gltf) => { // Укажите путь к модели игрока
        const model = gltf.scene;
        playerMeshes[playerId] = model;
        scene.add(model);
    });
}

socket.on('updatePlayers', (data) => {
    players = data;
    for (const playerId in players) {
        if (!playerMeshes[playerId]) {
            loadPlayerModel(playerId);
        }
        if (playerId !== myPlayerId && players[playerId]) {
            const targetPosition = new THREE.Vector3(players[playerId].position.x, players[playerId].position.y,
players[playerId].position.z);
            playerMeshes[playerId].position.lerp(targetPosition, 0.1);
        } else if (playerId === myPlayerId) {
            healthDisplay.textContent = `Health: ${players[playerId].health}`;
        }
    }
});




function loadWeaponModel() {
    const weaponLoader = new THREE.GLTFLoader();
    
    // 1. Убедись, что на GitHub файл называется именно ak47.glb
    weaponLoader.load('ak47.glb', (gltf) => { 
        weaponModel = gltf.scene;

        // КРИТИЧЕСКИЙ ФИКС: Увеличиваем масштаб. 
        // Если модель из CS 1.6, ставь от 1.0 до 5.0, чтобы увидеть её
        weaponModel.scale.set(1.5, 1.5, 1.5); 

        // ПОЗИЦИЯ: X: 0.5 (справа), Y: -0.6 (чуть ниже центра), Z: -1.2 (перед собой)
        weaponModel.position.set(0.5, -0.6, -1.2); 
        
        // ПОВОРОТ: Если ствол смотрит в тебя, разверни его на 180 градусов
        weaponModel.rotation.y = Math.PI; 

        // Добавляем к камере, чтобы пушка двигалась за взглядом
        camera.add(weaponModel);
        
        // ВАЖНО: Камера должна быть в сцене, чтобы видеть то, что к ней привязано
        if (!scene.children.includes(camera)) {
            scene.add(camera);
        }

        console.log("🎯 КАЛАШ ИЗ КОНТРЫ В РУКАХ!");
    }, undefined, (error) => {
        // --- ЗАГЛУШКА (Если файл не найден или ошибка в пути) ---
        console.warn("Файл ak47.glb не найден. Создаю временный неоновый клинок!");
        
        const geo = new THREE.BoxGeometry(0.1, 0.1, 1.5);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        weaponModel = new THREE.Mesh(geo, mat);
        
        weaponModel.position.set(0.5, -0.5, -1.0);
        camera.add(weaponModel);
        
        if (!scene.children.includes(camera)) {
            scene.add(camera);
        }
    });
}



function shootAnimation() {
    if (weaponModel) {
        const originalPosition = new THREE.Vector3(0, -0.5, -2);
        const recoilPosition = new THREE.Vector3(0, -0.6, -1.8);

        // Анимация отдачи
        weaponModel.position.lerp(recoilPosition, 0.1);
        setTimeout(() => {
            weaponModel.position.lerp(originalPosition, 0.1);
        }, 50);
    }
}

init();