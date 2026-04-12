"use client"

import {useEffect, useState} from "react";
import {io} from "socket.io-client";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Card,
    CardContent,
    Divider,
    Grid,
    Typography
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {MarketInterface, SocketMarketInterface} from "../../../../Interface/MarketInterface";

interface State {
    expectedNbSocketMarkets: number;
    expectedNbWaitingSocketMarkets: number;
    markets: MarketInterface[];
    socketMarkets: SocketMarketInterface[];
    waitingSocketMarkets: SocketMarketInterface[];
}

type SocketMarketProps = {
    socketMarket: SocketMarketInterface;
    markets: MarketInterface[];
}

type JsonProps = {
    json: unknown;
}

const websocketStateLabels: Record<number, string> = {
    0: "CONNECTING",
    1: "OPEN",
    2: "CLOSING",
    3: "CLOSED",
};

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

function SocketMarket({socketMarket, markets}: SocketMarketProps) {
    // @ts-expect-error socketMarket.websocket is not a Websocket but a readyState
    const websocketState = websocketStateLabels[socketMarket.websocket];

    const formattedData = {
        ...socketMarket,
        markets: socketMarket.markets.length,
        websocket: "[" + socketMarket.websocket + "]" + websocketState,
    };

    const getMarketUrl = (market: MarketInterface | undefined, encodeUri: boolean = false) => {
        let url = 'https://orbitxch.com/customer/sport/' + market?.event.competition.sport.id + '/market/' + market?.id;
        if (encodeUri) {
            url = encodeURI(url);
        }
        return url;
    }

    const marketToString = (market: MarketInterface | undefined, encodeUri: boolean = false) => {
        return "[" + market?.event.competition.sport.name + "-" + market?.event.competition.name + "] " + market?.event.name + ' ' + getMarketUrl(market, encodeUri)
    }

    return (
        <Card sx={{mb: 2, backgroundColor: "#f9f9f9"}}>
            <CardContent sx={{padding: "0!important"}}>
                <PreJson json={formattedData}/>
                {socketMarket.markets.length > 0 && (
                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                            <Typography component="span">Markets</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <ul style={{padding: 0}}>
                                {socketMarket.markets.map((m) => {
                                    const market = markets.find(t => t.id === m.id);
                                    return (
                                        <li key={m.id}>
                                            <a href={getMarketUrl(market)} target="_blank">
                                                {marketToString(market)}
                                            </a>
                                        </li>
                                    )
                                })}
                            </ul>
                        </AccordionDetails>
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}

export default function Home() {
    const [state, setState] = useState<State | undefined>(undefined)

    useEffect(() => {
        const socket = io('http://' + window.location.hostname + ':4002');
        socket.on('connect', () => {
            console.log('connected');
        });
        socket.on('details', (data) => {
            setState(data);
            console.log(data);
        });
        socket.on('disconnect', () => {
            console.log('disconnected');
        });
        return () => {
            socket.disconnect();
        };
    }, [])

    if (!state) {
        return (
            <main>
                <Typography>Chargement des données...</Typography>
            </main>
        );
    }

    const sizeCard = 3;
    const filteredState = Object.fromEntries(
        Object.entries(state).filter(
            ([key, value]) => !Array.isArray(value) || [
                'socketSports',
                'sureBets',
                'biggestDiff',
                'pages',
            ].includes(key)
        )
    );

    return (
        <main>
            <Typography>nb markets: {state.markets.length}</Typography>
            <PreJson json={filteredState}/>
            <PreJson json={websocketStateLabels}/>
            <Divider/>
            <Typography>nb socketMarkets: {state.socketMarkets?.length}</Typography>
            <Grid container spacing={2}>
                {state.socketMarkets?.map((socketMarket) => (
                    <Grid size={sizeCard} key={socketMarket.id}>
                        <SocketMarket socketMarket={socketMarket} markets={state.markets}/>
                    </Grid>
                ))}
            </Grid>
            <Divider/>
            <p>nb waitingSocketMarkets: {state.waitingSocketMarkets?.length}</p>
            <Grid container spacing={2}>
                {state.waitingSocketMarkets?.map((waitingSocketMarket) => (
                    <Grid size={sizeCard} key={waitingSocketMarket.id}>
                        <SocketMarket key={waitingSocketMarket.id} socketMarket={waitingSocketMarket}
                                      markets={state.markets}/>
                    </Grid>
                ))}
            </Grid>
        </main>
    );
}
