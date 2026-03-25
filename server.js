const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Для Render лучше поставить звездочку, чтобы не было ошибок доступа
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

let players = {};
let teams = { red: 0, blue: 0 };

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Присоединение к команде
    socket.on('joinTeam', (team) => {
        // Балансировка команд
        if (teams.red > teams.blue) team = 'blue';
        else if (teams.blue > teams.red) team = 'red';
        else team = (team === 'red' || team === 'blue') ? team : 'red';

        players[socket.id] = { 
            id: socket.id, 
            team, 
            health: 100, 
            score: 0, 
            position: {x:0, y:1.6, z:0}, 
            rotation: {x:0, y:0} 
        };
        teams[team]++;
        io.emit('updatePlayers', players);
    });

    // Обновление позиции
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            // Оптимизация: шлем данные всем, кроме отправителя
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    // Выстрел (Исправлено)
    socket.on('shoot', (data) => {
        const shooter = players[socket.id];
        const target = players[data.targetId]; // Берем ID из объекта data

        if (shooter && target) {
            target.health -= 20;
            if (target.health <= 0) {
                shooter.score += 10;
                target.health = 100; // Респаун
                target.position = {x: Math.random()*10-5, y:1.6, z:Math.random()*10-5};
                io.emit('playerKilled', { killerId: socket.id, victimId: data.targetId });
            }
            io.emit('updatePlayers', players);
        }
        // Исправлено: берем позицию из data
        io.emit('bulletFired', { shooterId: socket.id, targetPosition: data.targetPosition });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            teams[players[socket.id].team]--;
            delete players[socket.id];
            io.emit('updatePlayers', players);
        }
    });
});

// ФИНАЛЬНЫЙ ВАРИАНТ ЗАПУСКА
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ninja Server running on port ${PORT}`);
});

