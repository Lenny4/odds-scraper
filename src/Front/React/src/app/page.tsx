"use client"

import {useEffect, useState} from "react";
import {io} from "socket.io-client";
import {Typography} from "@mui/material";
import {DetailAppInterface} from "../../../../Interface/AppInterface";

type JsonProps = {
    json: unknown;
}

function linkifyJsonString(json: unknown): string {
    const jsonString = JSON.stringify(json, null, 2);

    const urlRegex = /(https?:\/\/[^\s"]+)/g;

    // Replace URLs with HTML anchor elements
    return jsonString.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

function PreJson({json}: JsonProps) {
    const linkedJson = linkifyJsonString(json);

    return (
        <pre
            style={{
                backgroundColor: "#eee",
                padding: "1rem",
                margin: 0,
                borderRadius: "8px",
                overflowX: "auto",
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
            }}
            dangerouslySetInnerHTML={{__html: linkedJson}}
        />
    );
}

export default function Home() {
    const [detailApp, setDetailApp] = useState<DetailAppInterface | undefined>(undefined)

    useEffect(() => {
        const socket = io('http://' + window.location.hostname + ':4002');
        socket.on('connect', () => {
            console.log('connected');
        });
        socket.on('details', (data) => {
            setDetailApp(data);
            console.log(data);
        });
        socket.on('disconnect', () => {
            console.log('disconnected');
        });
        return () => {
            socket.disconnect();
        };
    }, [])

    if (!detailApp) {
        return (
            <main>
                <Typography>Chargement des données...</Typography>
            </main>
        );
    }

    return (
        <main>
            <PreJson json={detailApp}/>
        </main>
    );
}
