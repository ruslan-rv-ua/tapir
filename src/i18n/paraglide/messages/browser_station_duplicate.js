/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Station_DuplicateInputs */

const uk_browser_station_duplicate = /** @type {(inputs: Browser_Station_DuplicateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Станція з таким URL вже є у списку`)
};

const en_browser_station_duplicate = /** @type {(inputs: Browser_Station_DuplicateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`A station with this URL already exists`)
};

/**
* | output |
* | --- |
* | "A station with this URL already exists" |
*
* @param {Browser_Station_DuplicateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_station_duplicate = /** @type {((inputs?: Browser_Station_DuplicateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Station_DuplicateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_station_duplicate(inputs)
	return en_browser_station_duplicate(inputs)
});