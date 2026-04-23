export interface ChartDataInterface {
    yMax: number | undefined;
    yMin: number | undefined;
    series: SerieInterface[];
    axes: ChartAxeInterface[];
    allTimestamps: number[];
    xMin: number | undefined;
    xMax: number | undefined;
}

export interface ChartAxeInterface {
    name: string;
    yMax: number | undefined;
    yMin: number | undefined;
    displayed?: boolean;
}

export interface SerieColorInterface {
    r: number;
    g: number;
    b: number;
    a: number
}

export interface SerieInterface {
    name: string,
    values: number[],
    times: number[],
    axe: string,
    opposite: boolean,
    color: SerieColorInterface,
    yMax: number | undefined;
    yMin: number | undefined;
}