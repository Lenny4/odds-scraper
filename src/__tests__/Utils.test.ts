import {describe, expect, it} from "vitest";
import {getDerive, getTickDiff, getTickSize, getValueByPath} from "../Service/Utils";
import RoundService from "../Service/RoundService";

describe("Utils", () => {
    it("getTickSize follows the exchange tick table", () => {
        expect(getTickSize(1.5)).toBe(0.01);
        expect(getTickSize(1.99)).toBe(0.01);
        expect(getTickSize(2)).toBe(0.02);
        expect(getTickSize(2.5)).toBe(0.02);
        expect(getTickSize(15)).toBe(0.5);
        expect(getTickSize(5000)).toBe(10);
    });

    it("getTickDiff counts ticks between two odds", () => {
        expect(getTickDiff(2, 2)).toBe(0);
        expect(getTickDiff(1.5, 1.6)).toBe(10);
        expect(getTickDiff(1.9, 2.1)).toBe(15);
        expect(getTickDiff(2.9, 3.2)).toBe(9);
    });

    it("getDerive only uses values since the given time (plus the previous one)", () => {
        const values = [
            {i: 1, t: 0, v: 2},
            {i: 2, t: 10, v: 1},
        ];
        expect(getDerive(values, 5)).toBe(-0.5);
        expect(getDerive(values, 20)).toBe(0);
        expect(getDerive([{i: 1, t: 0, v: 2}], 0)).toBe(0);
    });

    it("getValueByPath resolves array indexes", () => {
        expect(getValueByPath({a: [{b: 1}, {b: 2}]}, "a[1].b")).toBe(2);
        expect(getValueByPath({a: []}, "a[3].b")).toBeUndefined();
    });

    it("roundOddVolume rounds depending on magnitude", () => {
        expect(RoundService.roundOddVolume(42.4)).toBe(42);
        expect(RoundService.roundOddVolume(119)).toBe(120);
        expect(RoundService.roundOddVolume(171)).toBe(170);
        expect(RoundService.roundOddVolume(1549)).toBe(1500);
        expect(RoundService.roundOddVolume(1578)).toBe(1600);
    });
});
