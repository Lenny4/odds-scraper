"use client"

import React, {useEffect, useState} from "react";
import {Accordion, AccordionDetails, AccordionSummary, Typography} from "@mui/material";
import {DetailAppInterface} from "../../../../Interface/AppInterface";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    GroupMarketMessageInterface,
    OddReceiveInterface,
    OddRequestInterface
} from "../../../../Interface/LiveInterface";
import {socketDetails, socketGroupMarkets} from "@/app/sockets";
import {getOddsForOddRequest, getValueByPath} from "../../../../Service/Utils";
import {OddInterface} from "../../../../Interface/MarketInterface";
import Chart from "react-apexcharts";
import {ApexOptions} from "apexcharts";
import {ChartDataInterface, SerieInterface} from "@/interface/ChartInterface";

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

function ChartGroupMarket({groupMarketMessage, oddRequests}: {
    groupMarketMessage: GroupMarketMessageInterface,
    oddRequests: OddRequestInterface[]
}) {
    const [options, setOptions] = useState<ApexOptions | undefined>(undefined)

    const alignSeries = (series: SerieInterface[], allTimestamps: number[]) => {
        return series.map(serie => {
            const valueByTime = new Map<number, number>();

            for (let i = 0; i < serie.times.length; i++) {
                valueByTime.set(serie.times[i], serie.values[i]);
            }

            const alignedValues: number[] = [];
            let lastValue: number | undefined = undefined;

            for (const t of allTimestamps) {
                if (valueByTime.has(t)) {
                    lastValue = valueByTime.get(t)!;
                }

                if (lastValue === undefined) {
                    // fallback = first value
                    lastValue = serie.values[0];
                }

                alignedValues.push(lastValue);
            }

            return {
                ...serie,
                times: [...allTimestamps],
                values: alignedValues,
            };
        });
    }

    const getChartData = () => {
        const chartData: ChartDataInterface = {
            allTimestamps: [],
            xMax: undefined,
            xMin: undefined,
            series: [],
            yMax: undefined,
            yMin: undefined,
        };
        const timestampSet = new Set<number>();
        for (const oddRequest of oddRequests) {
            const market = groupMarketMessage.markets.find(m => m.id === oddRequest.marketId)!;
            const odds = getOddsForOddRequest(market, oddRequest);
            for (const odd of odds) {
                const serie: SerieInterface = {
                    name: odd.label,
                    values: [],
                    times: [],
                };
                for (const oddValue of odd.values) {
                    const v = oddValue.v;
                    const t = oddValue.t;
                    serie.values.push(v);
                    serie.times.push(t);
                    if (chartData.yMax === undefined || v > chartData.yMax) {
                        chartData.yMax = v;
                    }
                    if (chartData.yMin === undefined || v < chartData.yMin) {
                        chartData.yMin = v;
                    }
                    if (chartData.xMax === undefined || t > chartData.xMax) {
                        chartData.xMax = t;
                    }
                    if (chartData.xMin === undefined || t < chartData.xMin) {
                        chartData.xMin = t;
                    }
                    timestampSet.add(t);
                }
                chartData.series.push(serie);
            }
        }
        chartData.allTimestamps = Array.from(timestampSet);
        chartData.allTimestamps.sort((a, b) => a - b);
        chartData.series = alignSeries(chartData.series, chartData.allTimestamps);
        return chartData;
    };
    const updateOption = (): ApexOptions => {
        const chartData = getChartData();
        console.log(chartData);
        return {
            series: [
                {
                    name: "series-1",
                    data: [30, 40, 45, 50, 49, 60, 70, 91]
                }
            ],
            chart: {
                id: groupMarketMessage.id.toString(),
                type: "line"
            },
            xaxis: {
                categories: [1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999]
            }
        };
    }

    useEffect(() => {
        updateOption();
    }, [groupMarketMessage]);

    return (
        <>
            {options && (<Chart options={options} series={options.series}/>)}
        </>
    );
}

function GroupMarket({initGroupMarketMessage}: { initGroupMarketMessage: GroupMarketMessageInterface }) {
    const [groupMarketMessage, setGroupMarketMessage] = useState<GroupMarketMessageInterface>(initGroupMarketMessage)

    const getOddRequests = () => {
        const oddRequests: OddRequestInterface[] = [];
        for (const market of groupMarketMessage.markets) {
            const defaultOddRequest: OddRequestInterface = {
                groupMarketId: groupMarketMessage.id,
                marketId: market.id,
                path: "",
                supplier: market.supplier,
            };
            for (const [indexMarketRunner, marketRunner] of market.marketRunners.entries()) {
                if (marketRunner.odds.length === 0) {
                    oddRequests.push({
                        ...defaultOddRequest,
                        path: `marketRunners[${indexMarketRunner}].odds`,
                    });
                }
            }
        }
        return oddRequests;
    };
    const [oddRequests, setOddRequests] = useState<OddRequestInterface[]>(getOddRequests())

    const sendOddRequests = () => {
        if (oddRequests.length > 0) {
            socketGroupMarkets.emit("message", {
                type: "odds",
                value: oddRequests,
            });
        }
    };

    const handleOddReceive = (oddReceives: OddReceiveInterface[]) => {
        const oddRequests: OddRequestInterface[] = [];
        oddReceives = oddReceives.filter(or => or.groupMarketId === groupMarketMessage.id);
        if (oddReceives.length === 0) {
            return;
        }
        setGroupMarketMessage(gm => {
            for (const oddReceive of oddReceives) {
                const market = gm.markets.find(m => m.id === oddReceive.marketId && m.supplier === oddReceive.supplier);
                const oldOdds: OddInterface[] = getValueByPath(market, oddReceive.path);
                for (const newOdd of oddReceive.odds ?? []) {
                    if (newOdd.values.length === 0) {
                        continue;
                    }
                    const oldOdd = oldOdds.find(o =>
                        o.name === newOdd.name ||
                        o.type === newOdd.type ||
                        o.index === newOdd.index
                    );
                    const oddRequest: OddRequestInterface = {
                        i: 1,
                        marketId: oddReceive.marketId,
                        path: oddReceive.path,
                        groupMarketId: oddReceive.groupMarketId,
                        supplier: oddReceive.supplier,
                        type: newOdd.type,
                        name: newOdd.name,
                        index: newOdd.index,
                    }
                    if (oldOdd) {
                        const currentI = newOdd.values.at(-1)?.i ?? 0;
                        if (currentI + 1 < newOdd.values[0].i) {
                            oddRequests.push({
                                i: currentI + 1,
                                ...oddRequest,
                            });
                        } else {
                            oldOdd.values = [...oldOdd.values, ...newOdd.values.filter(v => v.i > currentI)];
                        }
                    } else {
                        if (newOdd.values[0].i === 1) {
                            oldOdds.push(newOdd);
                        } else {
                            oddRequests.push(oddRequest);
                        }
                    }
                }
            }
            return {...gm};
        })
        if (oddRequests.length > 0) {
            console.warn("missing", oddRequests);
            socketGroupMarkets.emit("message", {
                type: "odds",
                value: oddRequests,
            });
        }
    };

    const handleMessage = (data: OddReceiveInterface[] | GroupMarketMessageInterface[]) => {
        if (data.length === 0) return;
        if ("path" in data[0]) {
            // @ts-ignore
            handleOddReceive(data);
        } else {
            console.log("new message", data)
        }
    };

    useEffect(() => {
        sendOddRequests();
        socketGroupMarkets.on("message", handleMessage);
        return () => {
            socketGroupMarkets.off("message", handleMessage);
        };
    }, [groupMarketMessage.id]);


    return (
        <div>
            <ChartGroupMarket groupMarketMessage={groupMarketMessage} oddRequests={oddRequests}/>
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
                            {openGroupMarkets.includes(gm.id) && <GroupMarket initGroupMarketMessage={gm}/>}
                        </AccordionDetails>
                    </Accordion>
                )
            })}
        </main>
    );
}
