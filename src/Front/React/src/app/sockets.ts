// socket.ts
import {io, Socket} from "socket.io-client";

export const socketDetails: Socket = io("http://" + window.location.hostname + ":4002", {
    transports: ["websocket"],
    withCredentials: true,
});

export const socketGroupMarkets: Socket = io("http://" + window.location.hostname + ":4004", {
    transports: ["websocket"],
    withCredentials: true,
});