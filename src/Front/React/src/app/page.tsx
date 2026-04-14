"use client"

import {useEffect, useState} from "react";
import {io} from "socket.io-client";
import {Accordion, AccordionDetails, AccordionSummary, Typography} from "@mui/material";
import {DetailAppInterface, GroupMarketDetailInterface} from "../../../../Interface/AppInterface";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

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

function GroupMarket({groupMarket}: { groupMarket: GroupMarketDetailInterface }) {
    return (
        <div>
            display chart
        </div>
    );
}

export default function Home() {
    const [detailApp, setDetailApp] = useState<DetailAppInterface | undefined>(undefined)
    const [openGroupMarkets, setOpenGroupMarkets] = useState<number[]>([])

    const handleChange = (id: number) => {
        setOpenGroupMarkets(prev =>
            prev.includes(id) ? prev.filter(gmId => gmId !== id) : [...prev, id]
        );
    };

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
            setDetailApp(undefined);
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
            {detailApp.groupMarkets.sort((a, b) => {
                return b.markets.length - a.markets.length;
            }).map(gm => {
                const market = gm.markets[0];
                const suppliers = gm.markets.map(m => m.supplier);
                return (
                    <Accordion
                        key={gm.id}
                        expanded={openGroupMarkets.includes(gm.id)}
                        onChange={() => handleChange(gm.id)}
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                            <Typography component="span">
                                {`${market.event.competition.name} ${market.event.name} ${JSON.stringify(suppliers)}`}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            {openGroupMarkets.includes(gm.id) && <GroupMarket groupMarket={gm}/>}
                        </AccordionDetails>
                    </Accordion>
                )
            })}
        </main>
    );
}
