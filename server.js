const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

app.use(express.static('public'));

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function getRoom(room){
  if(!rooms.has(room)){
    rooms.set(room, {
      clients:new Map(),
      changes:[],
      worldData:null
    });
  }
  return rooms.get(room);
}

function broadcast(room, data, excludeId){
  const roomData = getRoom(room);
  const payload = JSON.stringify(data);

  for(const [id, client] of roomData.clients.entries()){

    if(id===excludeId) continue;

    if(client.readyState===WebSocket.OPEN){
      client.send(payload);
    }
  }
}

wss.on('connection', ws => {

  ws.room = null;
  ws.clientId = null;

  ws.on('message', message => {

    let data;

    try{
      data = JSON.parse(message.toString());
    }
    catch(e){
      return;
    }

    if(data.type==='join' && data.room){

      const room = getRoom(data.room);

      ws.room = data.room;

      ws.clientId =
        data.id ||
        ('p'+Math.random().toString(36).slice(2,10));

      ws.playerName = data.name || 'Player';

      room.clients.set(ws.clientId, ws);

      ws.send(JSON.stringify({
        type:'init',
        players:[...room.clients.values()].map(client => ({
          id: client.clientId,
          name: client.playerName
        })),
        changes: room.changes,
        worldData: room.worldData
      }));

      broadcast(
        data.room,
        {
          type:'player_join',
          id:ws.clientId,
          name:ws.playerName
        },
        ws.clientId
      );

      return;
    }

    if(!ws.room) return;

    const room = getRoom(ws.room);

    if(data.type==='block_update'){

      room.changes.push({
        x:data.x,
        y:data.y,
        z:data.z,
        blockType:data.blockType
      });

      broadcast(ws.room, data, data.id || ws.clientId);

      return;
    }

    if(data.type==='player_state'){
      broadcast(ws.room, data, data.id || ws.clientId);
      return;
    }

    if(data.type==='chat'){
      broadcast(ws.room, data, null);
      return;
    }

    if(data.type==='world_save'){
      room.worldData = data.data;
      return;
    }

  });

  ws.on('close', () => {

    if(ws.room && ws.clientId){

      const room = getRoom(ws.room);

      room.clients.delete(ws.clientId);

      broadcast(ws.room, {
        type:'player_leave',
        id:ws.clientId
      });

    }

  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});