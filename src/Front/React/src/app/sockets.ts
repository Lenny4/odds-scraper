// socket.ts
import {io, Socket} from "socket.io-client";

let socketDetails: Socket | null = null;
let socketGroupMarkets: Socket | null = null;

function getSocketDetails(): Socket {
    if (!socketDetails) {
        socketDetails = io(`http://${window.location.hostname}:4002`, {
            transports: ["websocket"],
            withCredentials: true,
        });
    }
    return socketDetails;
}

function getSocketGroupMarkets(): Socket {
    if (!socketGroupMarkets) {
        socketGroupMarkets = io(`http://${window.location.hostname}:4004`, {
            transports: ["websocket"],
            withCredentials: true,
        });
    }
    return socketGroupMarkets;
}

export {getSocketDetails, getSocketGroupMarkets};