"use client"

import React, {useEffect, useState} from "react";
import {Accordion, AccordionDetails, AccordionSummary, Box, Typography} from "@mui/material";
import {DetailAppInterface, SocketMarketDetailChildInterface} from "../../../../Interface/AppInterface";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    GroupMarketMessageInterface,
    OddReceiveInterface,
    OddRequestInterface
} from "../../../../Interface/LiveInterface";
import {getOddsForOddRequest, getValueByPath} from "../../../../Service/Utils";
import {MarketRunnerInterface, OddInterface} from "../../../../Interface/MarketInterface";
import Chart from "react-apexcharts";
import {ApexOptions} from "apexcharts";
import {ChartDataInterface, SerieColorInterface, SerieInterface} from "@/interface/ChartInterface";
import {OddNameEnum, OddTypeEnum} from "../../../../Enum/MarketEnum";
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import {CustomTabPanel} from "@/app/component/CustomTabPanel";
import {getSocketDetails, getSocketGroupMarkets} from "@/app/sockets";
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

type JsonProps = {
    json: unknown;
}

let applyZoomXaxis = true;

interface GroupSupplierOddRequestInterface {
    supplier: string;
    oddRequests: (OddRequestInterface & { oddRequestIndex: number })[];
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
    const [xaxis, setXaxis] = useState<ApexOptions['xaxis'] | undefined>(undefined)
    const [selectedOddRequests, setSelectedOddRequests] = useState<number[]>([])
    const [groupSupplierOddRequests, setGroupSupplierOddRequests] = useState<GroupSupplierOddRequestInterface[]>(() => {
        const result: GroupSupplierOddRequestInterface[] = [];
        for (const [indexOddRequest, oddRequest] of oddRequests.entries()) {
            let groupSupplierOddRequest = result.find(r => r.supplier === oddRequest.supplier);
            if (!groupSupplierOddRequest) {
                groupSupplierOddRequest = {
                    supplier: oddRequest.supplier,
                    oddRequests: [],
                }
                result.push(groupSupplierOddRequest)
            }
            groupSupplierOddRequest.oddRequests.push({
                ...oddRequest,
                oddRequestIndex: indexOddRequest
            })
        }
        return result;
    })

    const getSelectedOddRequests = () => {
        return oddRequests.filter((_, index) => selectedOddRequests.includes(index));
    }

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

    const SUPPLIER_HUE_SHIFT: Record<string, number> = {
        "OrbitxManager": 0,
        "PolymarketManager": 20,
    };

    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        const h = max === r ? (g - b) / d + (g < b ? 6 : 0)
            : max === g ? (b - r) / d + 2
                : (r - g) / d + 4;
        return [h * 60, s, l];
    };

    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [
            Math.round(hue2rgb(p, q, (h / 360) + 1 / 3) * 255),
            Math.round(hue2rgb(p, q, h / 360) * 255),
            Math.round(hue2rgb(p, q, (h / 360) - 1 / 3) * 255),
        ];
    };

    const shiftHue = (color: SerieColorInterface, degrees: number): SerieColorInterface => {
        const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
        const [r, g, b] = hslToRgb((h + degrees) % 360, s, l);
        return {r, g, b, a: color.a};
    };

    const getColor = (odd: OddInterface): SerieColorInterface => {
        const baseColor: SerieColorInterface =
            odd.type === OddTypeEnum.Back ? {r: 166, g: 216, b: 255, a: 1} :
                odd.type === OddTypeEnum.Lay ? {r: 250, g: 201, b: 209, a: 1} :
                    {r: 0, g: 0, b: 0, a: 0.5};

        const hueShift = SUPPLIER_HUE_SHIFT[odd.supplier] ?? 0;
        return hueShift === 0 ? baseColor : shiftHue(baseColor, hueShift);
    };

    const getChartData = () => {
        const now = Date.now();
        const chartData: ChartDataInterface = {
            allTimestamps: [],
            xMax: undefined,
            xMin: undefined,
            series: [],
            yMax: undefined,
            yMin: undefined,
        };
        const timestampSet = new Set<number>();
        for (const oddRequest of getSelectedOddRequests()) {
            const market = groupMarketMessage.markets.find(m => m.id === oddRequest.marketId)!;
            const odds = getOddsForOddRequest(market, oddRequest);
            for (const odd of odds) {
                const serie: SerieInterface = {
                    yMax: undefined,
                    yMin: undefined,
                    name: odd.label,
                    values: [],
                    times: [],
                    color: getColor(odd)
                };
                let v: number = 0;
                let t: number = 0;
                for (const oddValue of odd.values) {
                    v = oddValue.v / 1000;
                    t = oddValue.t;
                    serie.values.push(v);
                    serie.times.push(t);
                    if (serie.yMax === undefined || v > serie.yMax) {
                        serie.yMax = v;
                    }
                    if (serie.yMin === undefined || v < serie.yMin) {
                        serie.yMin = v;
                    }

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
                if (chartData.xMax === undefined || now > chartData.xMax) {
                    chartData.xMax = now;
                }
                serie.values.push(v);
                serie.times.push(now);

                chartData.series.push(serie);
            }
        }
        timestampSet.add(now);
        chartData.allTimestamps = Array.from(timestampSet);
        chartData.allTimestamps.sort((a, b) => a - b);
        chartData.series = alignSeries(chartData.series, chartData.allTimestamps);
        chartData.series.sort((a, b) => {
            const aLastValue = a.values[a.values.length - 1];
            const bLastValue = b.values[b.values.length - 1];
            return bLastValue - aLastValue;
        })
        return chartData;
    };

    const updateXaxis = (xaxis: { min: number; max: number; } | undefined) => {
        if (xaxis === undefined) {
            setXaxis(undefined);
        } else {
            setXaxis({
                type: 'datetime',
                ...xaxis
            });
        }
    };

    const updateOption = () => {
        const chartData = getChartData();
        const duration = Math.abs(chartData.allTimestamps[0] - chartData.allTimestamps[chartData.allTimestamps.length - 1]);
        const options: ApexOptions = {
            series: chartData.series.map(s => {
                return {
                    name: s.name,
                    data: s.values.map((v, i) => {
                        return [chartData.allTimestamps[i], v]
                    }),
                }
            }),
            chart: {
                id: groupMarketMessage.id.toString(),
                type: "line",
                animations: {
                    enabled: false,
                },
                toolbar: {
                    show: true, // This adds zoom + reset buttons
                    tools: {
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    }
                },
                zoom: {
                    enabled: true,
                    type: 'x', // Zoom only on x-axis (time)
                    autoScaleYaxis: true, // Optional: rescale y-axis on zoom
                    allowMouseWheelZoom: false,
                },
                events: {
                    scrolled: (chart, {xaxis}: { xaxis: { min: number; max: number; } }) => {
                        updateXaxis(xaxis)
                    },
                    zoomed: (chart, {xaxis}: { xaxis: { min: number; max: number; } }) => {
                        if (applyZoomXaxis) {
                            updateXaxis(xaxis)
                        }
                        applyZoomXaxis = true;
                    },
                    beforeResetZoom: (chart) => {
                        applyZoomXaxis = false;
                        updateXaxis(undefined)
                    },
                },
            },
            colors: chartData.series.map(s => {
                return `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${s.color.a})`
            }),
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'stepline',
            },
            markers: {
                size: 0
            },
            xaxis: xaxis ?? {
                type: 'datetime',
                min: Math.round(chartData.xMin! - duration * 0.02),
                max: Math.round(chartData.xMax! + duration * 0.02)
            },
            yaxis: {
                min: chartData.yMin! - (chartData.yMin! * 0.02),
                max: chartData.yMax! + (chartData.yMin! * 0.02),
            },
            legend: {
                show: true
            },
            subtitle: {
                text: 'Click on the serie legend at the bottom of the chart to hide the serie',
                align: 'center',
                style: {
                    fontSize: '13px',
                    color: '#666'
                }
            },
            tooltip: {
                enabled: true,
                shared: true, // tells ApexCharts to try showing all series info for a given x value
                followCursor: true,
                x: {
                    format: "yyyy-MM-dd HH:mm:ss"
                },
            },
        };
        setOptions(options);
    }

    const sendOddRequests = () => {
        if (selectedOddRequests.length > 0) {
            getSocketGroupMarkets().emit("message", {
                type: "odds",
                value: getSelectedOddRequests(),
            });
        }
    };

    const handleChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedOddRequests(x => {
            if (event.target.checked) {
                return [...x, index];
            }
            return x.filter(i => i !== index);
        });
    };

    useEffect(() => {
        updateOption();
    }, [groupMarketMessage, xaxis]);

    useEffect(() => {
        sendOddRequests();
    }, [selectedOddRequests]);

    return (
        <>
            <Box sx={{display: "flex"}}>
                {groupSupplierOddRequests.map(groupSupplierOddRequest => (
                    <FormGroup key={groupSupplierOddRequest.supplier}>
                        {groupSupplierOddRequest.oddRequests.map((or) => {
                            if (or.index === 0 && or.name === OddNameEnum.RunnerOddValue) {
                                const market = groupMarketMessage.markets.find(m => m.id === or.marketId && m.supplier === or.supplier)!;
                                const marketRunner: MarketRunnerInterface = getValueByPath(market, or.path.replace(".odds", ""));
                                const runner = market.runners.find(r => r.id === marketRunner.runnerId)!;
                                return (
                                    <FormControlLabel key={or.oddRequestIndex}
                                                      control={<Checkbox
                                                          checked={selectedOddRequests.includes(or.oddRequestIndex)}
                                                          onChange={handleChange(or.oddRequestIndex)}/>}
                                                      label={JSON.stringify({
                                                          supplier: or.supplier,
                                                          type: or.type,
                                                          name: runner.name
                                                      })}/>
                                )
                            }
                            return (
                                <React.Fragment key={or.oddRequestIndex}></React.Fragment>
                            )
                        })}
                    </FormGroup>
                ))}
            </Box>
            {options && (<Chart options={options} series={options.series}/>)}
        </>
    );
}

function GroupMarket({initGroupMarketMessage}: { initGroupMarketMessage: GroupMarketMessageInterface }) {
    const [groupMarketMessage, setGroupMarketMessage] = useState<GroupMarketMessageInterface>(initGroupMarketMessage)

    const getOddRequests = () => {
        const oddRequests: OddRequestInterface[] = [];
        for (const market of groupMarketMessage.markets) {
            for (const [indexMarketRunner, marketRunner] of market.marketRunners.entries()) {
                for (const odd of marketRunner.odds) {
                    oddRequests.push({
                        groupMarketId: groupMarketMessage.id,
                        marketId: market.id,
                        name: odd.name,
                        type: odd.type,
                        path: `marketRunners[${indexMarketRunner}].odds`,
                        supplier: market.supplier,
                        index: odd.index,
                    });
                }
            }
        }
        return oddRequests;
    };
    const [oddRequests, setOddRequests] = useState<OddRequestInterface[]>(getOddRequests())

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
                        o.name === newOdd.name &&
                        o.type === newOdd.type &&
                        o.supplier === newOdd.supplier &&
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
                        const currentI = oldOdd.values.at(-1)?.i ?? 0;
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
            getSocketGroupMarkets().emit("message", {
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
        const socketGroupMarkets = getSocketGroupMarkets();
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

function SocketMarket({socketMarket}: { socketMarket: SocketMarketDetailChildInterface }) {
    return (
        <div>
            <PreJson json={socketMarket}/>
        </div>
    );
}

export default function Home() {
    const [detailApp, setDetailApp] = useState<DetailAppInterface | undefined>(undefined)
    const [openGroupMarkets, setOpenGroupMarkets] = useState<number[]>([]);

    const [value, setValue] = React.useState(0);

    const handleChangeTab = (event: React.SyntheticEvent, newValue: number) => {
        setValue(newValue);
    };

    const handleChangeAccordion = (id: number) => {
        setOpenGroupMarkets(prev =>
            prev.includes(id) ? prev.filter(gmId => gmId !== id) : [...prev, id]
        );
    };

    useEffect(() => {
        getSocketGroupMarkets().emit("message", {
            type: "join",
            value: openGroupMarkets
        });
    }, [openGroupMarkets]);

    useEffect(() => {
        const socketDetails = getSocketDetails();
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
            <Box sx={{borderBottom: 1, borderColor: 'divider'}}>
                <Tabs value={value} onChange={handleChangeTab}>
                    <Tab label="Markets"/>
                    <Tab label="Socket Markets"/>
                </Tabs>
            </Box>
            <CustomTabPanel value={value} index={0}>
                {detailApp.groupMarkets.sort((a, b) => {
                    if (b.markets.length === a.markets.length) {
                        return a.startTime - b.startTime;
                    }
                    return b.markets.length - a.markets.length;
                }).map(gm => {
                    const market = gm.markets[0];
                    const suppliers = gm.markets.map(m => m.supplier);
                    return (
                        <Accordion
                            key={gm.id}
                            expanded={openGroupMarkets.includes(gm.id)}
                            onChange={() => handleChangeAccordion(gm.id)}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                                <Typography component="span">
                                    {`${market.event.competition.name} ${market.event.name} ${JSON.stringify(suppliers)} ${new Date(gm.startTime).toLocaleString("fr-FR", {
                                        day: "2-digit",
                                        month: "long",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}`}
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                {openGroupMarkets.includes(gm.id) && <GroupMarket initGroupMarketMessage={gm}/>}
                            </AccordionDetails>
                        </Accordion>
                    )
                })}
            </CustomTabPanel>
            <CustomTabPanel value={value} index={1}>
                {detailApp.socketMarkets.map((socketMarket) => {
                    return (
                        <Box key={socketMarket.name}>
                            <Typography>{socketMarket.name}</Typography>
                            {socketMarket.socketMarkets.map(sm => {
                                return (
                                    <SocketMarket key={sm.id} socketMarket={sm}/>
                                )
                            })}
                        </Box>
                    )
                })}
            </CustomTabPanel>
        </main>
    );
}
