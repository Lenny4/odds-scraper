export interface ChartDataInterface {
    yMax: number | undefined;
    yMin: number | undefined;
    series: SerieInterface[];
    allTimestamps: number[];
    xMin: number | undefined;
    xMax: number | undefined;
}

export interface SerieInterface {
    name: string,
    values: number[],
    times: number[],
}