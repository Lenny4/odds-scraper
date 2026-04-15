"use client"

import {useEffect, useState} from "react";
import {Accordion, AccordionDetails, AccordionSummary, Typography} from "@mui/material";
import {DetailAppInterface} from "../../../../Interface/AppInterface";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    GroupMarketMessageInterface,
    GroupMarketRequestInterface,
    OddReceiveInterface
} from "../../../../Interface/LiveInterface";
import {socketDetails, socketGroupMarkets} from "@/app/sockets";

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

function GroupMarket({initGroupMarket}: { initGroupMarket: GroupMarketMessageInterface }) {
    const [groupMarket, setGroupMarket] = useState<GroupMarketMessageInterface>(initGroupMarket)
    const getGroupMarketOdds = (groupMarketRequest: GroupMarketRequestInterface) => {
        socketGroupMarkets.emit("message", {
            type: "groupMarkets",
            value: groupMarketRequest,
        });
    }

    const handleGroupMarketMessage = (groupMarketMessages: GroupMarketMessageInterface[]) => {
        const groupMarketMessage = groupMarketMessages.find(gm => gm.id === groupMarket.id);
        if (groupMarketMessage) {
            setGroupMarket(groupMarketMessage);
        }
    };

    const handleOddReceive = (oddReceives: OddReceiveInterface[]) => {
        console.log("oddReceive", oddReceives);
    };

    const handleMessage = (data: OddReceiveInterface[] | GroupMarketMessageInterface[]) => {
        if (data.length === 0) return;

        if ("id" in data[0]) {
            // @ts-ignore
            handleGroupMarketMessage(data);
        } else {
            // @ts-ignore
            handleOddReceive(data);
        }
    };

    useEffect(() => {
        getGroupMarketOdds({
            groupMarketIds: [groupMarket.id],
        })
        socketGroupMarkets.on("message", handleMessage);
        return () => {
            socketGroupMarkets.off("message", handleMessage);
        };
    }, [groupMarket.id]);

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
        socketGroupMarkets.emit("message", {
            type: "join",
            value: openGroupMarkets
        });
    }, [openGroupMarkets]);

    useEffect(() => {
        socketDetails.on('connect', () => {
            // nothing
        });
        socketDetails.on('details', (data) => {
            setDetailApp(data);
            // console.log(data);
        });
        socketDetails.on('disconnect', () => {
            setDetailApp(undefined);
        });
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
                            {openGroupMarkets.includes(gm.id) && <GroupMarket initGroupMarket={gm}/>}
                        </AccordionDetails>
                    </Accordion>
                )
            })}
        </main>
    );
}
