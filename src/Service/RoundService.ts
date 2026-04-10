'use strict';

export default class RoundService {
    /**
     * Rounds the input value based on its magnitude.
     *
     * This function checks if the given numeric value is greater than 100.
     * If it is, it calculates a rounding multiplier based on the number of digits
     * in the value. The value is then rounded to the nearest multiple of that multiplier.
     *
     * For example:
     * - If the value is 119, it will be rounded to 120.
     * - If the value is 171, it will be rounded to 170.
     * - If the value is 1549, it will be rounded to 1500.
     * - If the value is 1578, it will be rounded to 1600.
     * - Values less than or equal to 100 remain unchanged.
     */
    public static roundOddVolume(value: number): number {
        if (value <= 100) {
            return Math.round(value);
        }
        // Determine the number of digits minus one (e.g., 119 -> 2 && 1549 -> 3).
        const nbChar = Math.round(value).toString().length - 1;
        // Create a multiplier by generating a number like 10, 100, 1000, etc.
        const multiplier = Number("1".padEnd(nbChar, '0'));
        // Round the value to the nearest multiple of the multiplier.
        return Math.round(value / multiplier) * multiplier;
    }
}
