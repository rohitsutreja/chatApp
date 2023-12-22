import express from "express";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3500;
const ADMIN = "Admin";

const app = express();

app.use(express.static(path.join(__dirname, "public")));

const expressServer = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const UsersState = {
  users: [],
  setUsers: function (newUsersArray) {
    this.users = newUsersArray;
  },
};

const io = new Server(expressServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // when connected - only show to user
  socket.emit("message", buildMsg(ADMIN, "Welcome to Chat APP"));

  socket.on("enterRoom", ({ name, room }) => {
    // leave previous room
    const prevRoom = getUser(socket.id)?.room;

    if (prevRoom) {
      socket.leave(prevRoom);
      io.to(prevRoom).emit(
        "message",
        buildMsg(ADMIN, `${name} has left the room`)
      );
    }

    // join new room
    const user = activateUser(socket.id, name, room);

    // can not update previous room users list until after the state update in activate user
    if (prevRoom) {
      io.to(prevRoom).emit("userList", {
        users: getUsersInRoom(prevRoom),
      });
    }

    socket.join(user.room);

    // send message to user and broadcast to room
    socket.emit(
      "message",
      buildMsg(ADMIN, `You have joined the ${user.room} room`)
    );

    socket.broadcast
      .to(user.room)
      .emit("message", buildMsg(ADMIN, `${user.name} has joined the room`));

    // send user list to user and broadcast to room
    io.to(user.room).emit("userList", {
      users: getUsersInRoom(user.room),
    });

    io.emit("roomList", {
      rooms: getAllActiveRooms(),
    });
  });

  // when user disconnect
  socket.on("disconnect", () => {
    const user = getUser(socket.id);
    deactivateUser(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        buildMsg(ADMIN, `${user.name} has left the room`)
      );

      io.to(user.room).emit("userList", {
        users: getUsersInRoom(user.room),
      });

      io.emit("roomList", {
        rooms: getAllActiveRooms(),
      });
    }
  });

  // listening for message event
  socket.on("message", ({ name, text }) => {
    const room = getUser(socket.id)?.room;

    if (room) {
      io.to(room).emit("message", buildMsg(name, text));
    }
  });

  // listening for activity event
  socket.on("activity", (name) => {
    const room = getUser(socket.id)?.room;

    if (room) {
      socket.broadcast.to(room).emit("activity", name);
    }
  });
});

function buildMsg(name, text) {
  return {
    name,
    text,
    time: new Intl.DateTimeFormat("default", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).format(new Date()),
  };
}

function activateUser(id, name, room) {
  const user = {
    id,
    name,
    room,
  };

  UsersState.setUsers([
    ...UsersState.users.filter((user) => user.id !== id),
    user,
  ]);

  return user;
}

function deactivateUser(id) {
  UsersState.setUsers(UsersState.users.filter((user) => user.id !== id));
}

function getUser(id) {
  return UsersState.users.find((user) => user.id === id);
}

function getAllActiveRooms() {
  return Array.from(new Set(UsersState.users.map((user) => user.room)));
}

function getUsersInRoom(room) {
  return UsersState.users.filter((user) => user.room === room);
}
