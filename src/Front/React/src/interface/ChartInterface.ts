export interface ChartDataInterface {
    yMax: number | undefined;
    yMin: number | undefined;
    series: SerieInterface[];
    allTimestamps: number[];
    xMin: number | undefined;
    xMax: number | undefined;
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
    color: SerieColorInterface,
    yMax: number | undefined;
    yMin: number | undefined;
}