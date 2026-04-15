// socket.ts
import {io, Socket} from "socket.io-client";

export const socketDetails: Socket = io("http://localhost:4002", {
    transports: ["websocket"],
    withCredentials: true,
});

export const socketGroupMarkets: Socket = io("http://localhost:4004", {
    transports: ["websocket"],
    withCredentials: true,
});